# UMP, SHIP & SLAP Data Recovery

This project provides a set of tools for recovering and re‑broadcasting Bitcoin
transaction data associated with three overlay protocols in the BSV ecosystem:

* **UMP – User Management Protocol**: an overlay network used to manage
  user identities and profiles.  The official UMP services repository
  describes itself as an “overlay network for the User Management Protocol”【656750051496008†screenshot】.
* **SHIP – Services Host Interconnect Protocol**: part of the *Overlay
  Services Synchronization Architecture* defined in BRC‑88.  SHIP enables
  efficient peer discovery and data synchronization across UTXO‑based overlay
  networks and specifies how nodes advertise the topics they host【856955366900503†L6-L25】.
* **SLAP – Services Lookup Availability Protocol**: also part of BRC‑88; it
  works alongside SHIP to standardise lookup services so that users can find
  overlay hosts that run particular services【856955366900503†L6-L25】.  BRC‑88
  specifies the components (topic managers, lookup services and
  advertisers) needed to maintain reliable and up‑to‑date overlay services【856955366900503†L25-L33】.

The toolchain in this repository helps **recover and broadcast** data for
transactions that belong to these overlay networks.  It operates on
transaction metadata exported by other systems (e.g. from a database or
log file), fetches the *Background Evaluation Extended Format* (BEEF) for
each transaction and tags it with the appropriate overlay topic.  The
resulting dataset can then be broadcast back onto the overlay network via
an HTTPS overlay facilitator.

## Background

### BEEF – Background Evaluation Extended Format

BEEF is a binary format defined in BRC‑62 for sending Bitcoin transactions
between peers in a way that enables *Simplified Payment Verification* (SPV).
It is **optimised for minimal bandwidth** while preserving all of the data
required to independently validate the transaction【431162746216205†L9-L16】.  In its
simplest form the format bundles one mined transaction (with a Merkle path
proof) and the new transaction that spends its output【431162746216205†L13-L16】, and
recursively includes ancestral transactions until every input has a
corresponding parent with a Merkle proof【431162746216205†L13-L16】.  BEEF is the
backbone of transaction exchange in the overlay protocols.

### BUMP – BSV Unified Merkle Path

BUMP stands for **BSV Unified Merkle Path** and is defined in BRC‑74.  It
provides a compact binary and JSON encoding of Merkle proofs for multiple
transactions in the same block【233777480220447†L8-L14】.  The format encodes the
block height first, then level 0 of the Merkle tree (the txids of
interest and their siblings) and then encodes higher levels only as
needed to calculate the Merkle root【233777480220447†L10-L14】.  BEEF uses BUMP
internally to include the proof data required to validate each mined
transaction【431162746216205†L56-L69】.

### SHIP & SLAP

BRC‑88 defines the **Overlay Services Synchronization Architecture** and
introduces two complementary protocols: **Services Host Interconnect
Protocol (SHIP)** and **Services Lookup Availability Protocol (SLAP)**【856955366900503†L6-L25】.
SHIP allows nodes running overlay services to advertise the topics they
host and to synchronise those advertisements with other nodes【856955366900503†L40-L46】.
SLAP standardises lookup services so that clients can find the hosts that
offer a particular service【856955366900503†L20-L33】.  Topic managers and lookup
services ensure that transactions are admitted to the correct topics and
that UTXO state can be queried efficiently【856955366900503†L25-L33】.

### UMP – User Management Protocol

UMP is an overlay protocol for managing user identities and profiles.  The
BSV‑Blockchain `ump‑services` repository summarises it as an “overlay
network for the User Management Protocol”【656750051496008†screenshot】.  UMP uses
overlay transactions to publish and update user records and relies on
topic managers named `tm_users` to admit these transactions.  This tool
tags recovered BEEF data for UMP with the `tm_users` topic.

## Project structure

```
ump-ship-slap-recovery/
├── src/
│   └── taggedBeef.ts   – main library and CLI implementation
├── package.json        – npm scripts and dependencies
├── tsconfig.json       – TypeScript configuration
├── .gitignore
└── README.md           – this document
```

### `src/taggedBeef.ts`

The heart of the project lives in `src/taggedBeef.ts`.  It exports three
functions:

1. **`loadTxMetaFromFile(recordType, inDir?)`** – reads a newline‑delimited
   JSON file of transaction metadata (one JSON object per line) and
   returns an array of records.  By default it expects files named
   `ump-output.json`, `ship-output.json` or `slap-output.json` under
   the `src` directory.
2. **`fetchAndSaveTaggedBeef(recordType, txList, chain?, outDir?)`** – for
   each transaction metadata record it fetches the BEEF from
   WhatsOnChain (using `@bsv/wallet-toolbox-client`), tags it with the
   appropriate overlay topics (e.g. `tm_users`, `tm_ship`, `tm_slap`) and
   writes the result as a JSON array to `tagged_beef_<recordType>.json`.
   Only successfully fetched entries are saved.
3. **`broadcastTaggedBeef(recordType, filePath?, endpoint?)`** – reads a
   tagged BEEF file and broadcasts each entry to the given HTTPS overlay
   endpoint using `HTTPSOverlayBroadcastFacilitator` from `@bsv/sdk`.  The
   default endpoint is an example backend, but you can supply your own.

The file also contains a **CLI entry point** so you can run it directly
with Node.js:

```
node dist/taggedBeef.js <ump|ship|slap> [--prepare] [--broadcast]
```

See the “Usage” section below for a more convenient way of running the
commands via npm scripts.

## Installation

1. Install [Node.js](https://nodejs.org/) (v16 or higher) and npm.
2. Clone this repository and install dependencies:

```sh
npm install
```

3. Compile the TypeScript source:

```sh
npm run build
```

Optionally, you can run the scripts using `ts-node` without compiling by
prefixing the commands with `npx ts-node` or using the provided npm
scripts.

### Environment Variables

The code uses the [WhatsOnChain](https://whatsonchain.com/) API via
`@bsv/wallet-toolbox-client` to fetch BEEF data.  Supply a `WOC_API_KEY`
environment variable to use your own API key; otherwise a public key is
used.  For example:

```sh
export WOC_API_KEY=your_api_key_here
```

## Preparing input files

To recover BEEF data you first need a list of transaction metadata records.
Each line in the input file should be a JSON object with at least a `txid`
field.  Additional fields (`outputIndex`, `presentationHash` and
`recoveryHash`) are preserved but not required for BEEF recovery.  For
example, an `ump-output.json` file might look like this:

```json
{"txid": "3a6f...", "outputIndex": 0, "presentationHash": "...", "recoveryHash": "..."}
{"txid": "b7d1...", "outputIndex": 1, "presentationHash": "...", "recoveryHash": "..."}
```

Place the file in the `src` directory and name it `<recordType>-output.json`,
where `<recordType>` is `ump`, `ship` or `slap`.  The `loadTxMetaFromFile`
function automatically reads from this location when you run a prepare
operation.

## Usage

This project defines several npm scripts to simplify common tasks.

### Fetch and tag BEEF

Fetch BEEF data for all transactions in the appropriate input file and
write the tagged result to `tagged_beef_<recordType>.json`:

```sh
# recover UMP transactions on mainnet
npm run prepare:ump

# recover SHIP transactions on mainnet
npm run prepare:ship

# recover SLAP transactions on mainnet
npm run prepare:slap

# recover UMP transactions on testnet
npx ts-node src/taggedBeef.ts ump --prepare --chain test
```

### Broadcast tagged data

After running a prepare step, broadcast the tagged data back to the
overlay network:

```sh
# broadcast UMP data to the default overlay endpoint
npm run broadcast:ump

# broadcast SHIP data
npm run broadcast:ship

# broadcast SLAP data
npm run broadcast:slap
```

You can override the default endpoint by providing the third argument when
invoking `broadcastTaggedBeef` in your own script or by modifying the npm
command.

## Contributing

Contributions are welcome!  If you discover bugs or have suggestions for
improvement, please open an issue or submit a pull request.
