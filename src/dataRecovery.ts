import { Beef, HTTPSOverlayBroadcastFacilitator, TaggedBEEF } from '@bsv/sdk';
import { Services } from '@bsv/wallet-toolbox-client';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import path from 'node:path';

/** -------------------------------------------------------------------------
 * Shared helpers & constants
 *
 * This module provides a set of helper functions and a CLI for fetching
 * Background Evaluation Extended Format (BEEF) data for a list of
 * transaction metadata records and broadcasting them back onto an overlay
 * network.  Each record type (UMP, SHIP and SLAP) maps to one or more
 * overlay topics – see README for details.
 *
 * The code in this file is intentionally written in TypeScript to aid
 * maintainability.  Compile it with `npm run build` or run directly with
 * `ts-node` via the npm scripts defined in `package.json`.
 *
 * ---------------------------------------------------------------------- */

/**
 * Supported record types.  Each corresponds to a particular overlay
 * protocol: UMP stands for User Management Protocol, SHIP stands for
 * Services Host Interconnect Protocol, and SLAP stands for Services
 * Lookup Availability Protocol.
 */
type RecordType = 'ump' | 'ship' | 'slap';

/**
 * Mapping from our record type to the overlay topics that should be used
 * when tagging BEEF data.  Topic names follow the naming convention
 * prescribed by BRC‑87: lower‑case with a `tm_` prefix (topic manager).
 */
const TOPIC_MAP: Record<RecordType, string[]> = {
  ump: ['tm_users'],
  ship: ['tm_ship'],
  slap: ['tm_slap'],
};

/**
 * Given a record type, return the overlay topics that should be used.
 */
function getTopics(recordType: RecordType): string[] {
  return TOPIC_MAP[recordType];
}

/**
 * Build a default output filename for tagged BEEF data based on the record
 * type.  Files are written into the provided outDir (defaults to project
 * root when none is provided).
 */
function getDefaultOutputFile(recordType: RecordType, outDir: string = '.'): string {
  return path.join(outDir, `tagged_beef_${recordType}.json`);
}

/**
 * Build a default input filename for TxMeta records based on the record
 * type.  Files are read from the provided inDir (defaults to project
 * root when none is provided).  See README for details on the expected
 * format of these files.
 */
function getDefaultInputFile(recordType: RecordType, inDir: string = '.'): string {
  return path.join(inDir, `${recordType}-output.json`);
}

/**
 * Query WhatsOnChain via wallet‑toolbox to obtain the raw BEEF for a txid.
 * Falls back to the public mainnet key if WOC_API_KEY env var is not supplied.
 *
 * Note: network defaults to "main" which corresponds to Bitcoin mainnet.  You
 * can pass "test" when recovering testnet data.
 */
async function getBeefForTxid(txid: string, chain: 'main' | 'test' = 'main'): Promise<Beef> {
  const so = Services.createDefaultOptions(chain);
  so.whatsOnChainApiKey =
    process.env.WOC_API_KEY ?? 'mainnet_f04a761108dc219136b903597c91c778';
  const services = new Services(so);
  return services.getBeefForTxid(txid);
}

/**
 * Shape of a transaction metadata record.  Each record describes the
 * location of transaction outputs and their associated presentation and
 * recovery hashes.  Only the txid is required for BEEF recovery.
 */
export interface TxMeta {
  _id?: unknown;
  txid: string;
  outputIndex: number;
  presentationHash: string;
  recoveryHash: string;
}

/** -------------------------------------------------------------------------
 * 1️⃣  Fetch BEEF, tag, and save to a JSON file (per recordType)
 *
 * Given a record type, a list of TxMeta entries and an optional chain name
 * (main or test) this function fetches BEEF data for each txid via
 * WhatsOnChain, tags it with overlay topics and writes it to a JSON file.
 *
 * Only successfully fetched BEEF entries are written to the file; any
 * failures will be logged and skipped.  The return value is the path to
 * the written file.  See README for details on how to prepare input files.
 */
export async function fetchAndSaveTaggedBeef(
  recordType: RecordType,
  txList: TxMeta[],
  chain: 'main' | 'test' = 'main',
  outDir: string = '.'
): Promise<string> {
  const topics = getTopics(recordType);
  const outPath = getDefaultOutputFile(recordType, outDir);
  const tagged: TaggedBEEF[] = [];

  for (const { txid } of txList) {
    try {
      const beef = await getBeefForTxid(txid, chain);
      // SDK Beef implements toBinary() → Uint8Array; convert to regular array for JSON
      tagged.push({ beef: Array.from(beef.toBinary()), topics });
      console.log(chalk.green(`✔︎ fetched BEEF for ${txid}`));
    } catch (err) {
      console.warn(chalk.yellow(`⚠︎ Skipped ${txid}: ${(err as Error).message}`));
    }
  }

  await fs.writeFile(outPath, JSON.stringify(tagged, null, 2), 'utf8');
  console.log(chalk.blue(`Saved ${tagged.length} record(s) → ${outPath}`));
  return outPath;
}

/** -------------------------------------------------------------------------
 * 2️⃣  Broadcast a previously‑saved tagged‑BEEF file using HTTPSOverlay
 *
 * Given a record type and an optional filePath, this function reads the
 * tagged BEEF file and submits each entry to the provided endpoint via
 * HTTPS overlay broadcast facilitator.  See README for details on the
 * default endpoint and how to configure your own.
 */
export async function broadcastTaggedBeef(
  recordType: RecordType,
  filePath?: string,
  endpoint: string =
    'https://backend.c6a84fc53bb50c34e179dcd861eb3964.projects.babbage.systems'
): Promise<void> {
  const resolvedPath = filePath ?? getDefaultOutputFile(recordType);
  const raw = await fs.readFile(resolvedPath, 'utf8');
  const dataset: TaggedBEEF[] = JSON.parse(raw);

  const fac = new HTTPSOverlayBroadcastFacilitator();

  for (const tagged of dataset) {
    try {
      const steak = await fac.send(endpoint, tagged);
      console.log(chalk.green('✔︎ Broadcast succeeded →'), steak);
    } catch (err) {
      console.error(chalk.red('❌ Broadcast failed:'), err, tagged);
    }
  }
}

/** -------------------------------------------------------------------------
 * 3️⃣  Load TxMeta records from a line‑delimited JSON file (per recordType)
 *
 * When preparing BEEF data you must first load a list of transaction
 * metadata records.  These are stored as newline‑separated JSON objects in
 * files named `${recordType}-output.json` in the `src` folder by default.
 * Lines that cannot be parsed as JSON are skipped.  The function logs the
 * number of successfully loaded records.
 */
export async function loadTxMetaFromFile(
  recordType: RecordType,
  inDir: string = '.'
): Promise<TxMeta[]> {
  const filePath = getDefaultInputFile(recordType, inDir);

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const lines = fileContent.trim().split('\n');
    const records: TxMeta[] = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          const record = JSON.parse(line) as TxMeta;
          records.push(record);
        } catch {
          console.warn(
            chalk.yellow(`⚠︎ Skipped malformed line: ${line.substring(0, 50)}...`)
          );
        }
      }
    }

    console.log(chalk.blue(`Loaded ${records.length} TxMeta records from ${filePath}`));
    return records;
  } catch (err) {
    console.error(chalk.red(`❌ Failed to load TxMeta records from ${filePath}:`), err);
    throw err;
  }
}

/** -------------------------------------------------------------------------
 * 4️⃣  CLI entry — `node taggedBeef.js <ump|ship|slap> [--prepare] [--broadcast]`
 *
 * You can execute this module directly with Node.js.  When run from the
 * command line the first argument selects the record type (defaults to
 * `ump` when omitted).  Passing `--prepare` will load the transaction
 * metadata file and fetch & save tagged BEEF records.  Passing
 * `--broadcast` will broadcast the previously saved file to the default
 * endpoint.  If neither flag is provided a usage message is printed.
 */
;(async () => {
  const args = process.argv.slice(2);
  const recordType = (args[0] as RecordType) ?? 'ump';
  const doPrepare = args.includes('--prepare');
  const doBroadcast = args.includes('--broadcast');

  try {
    if (doPrepare) {
      const txMetaRecords = await loadTxMetaFromFile(recordType, './src');
      await fetchAndSaveTaggedBeef(recordType, txMetaRecords);
    }

    if (doBroadcast) {
      await broadcastTaggedBeef(recordType);
    }

    if (!doPrepare && !doBroadcast) {
      console.log(
        `Usage: node taggedBeef.js <ump|ship|slap> [--prepare] [--broadcast]`
      );
    }
  } catch (err) {
    console.error(chalk.red('❌ Process failed:'), err);
    process.exit(1);
  }
})();