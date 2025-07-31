# UMP, SHIP & SLAP Data Recovery

This project provides tools for recovering and broadcasting Bitcoin transaction data associated with three overlay protocols in the BSV ecosystem:

* **UMP – User Management Protocol**
  An overlay network used to manage user identities and profiles. See the [UMP Services repository](https://github.com/bsv-blockchain/ump-services) for implementation details.

* **SHIP – Services Host Interconnect Protocol**
  Part of the *Overlay Services Synchronization Architecture* defined in [BRC‑88](https://github.com/bitcoin-sv/BRCs/blob/master/overlays/0088.md), SHIP enables efficient peer discovery and data synchronization across overlay networks. It lets nodes advertise the topics they host.

* **SLAP – Services Lookup Availability Protocol**
  Also defined in BRC‑88, SLAP helps clients discover which hosts run specific overlay services. It standardizes lookup services and works alongside SHIP.

This toolchain processes transaction metadata, fetches **BEEF** (Background Evaluation Extended Format) data for each transaction, tags it for the appropriate overlay topic, and broadcasts it to the overlay network via HTTPS.

---

## 🧠 Background

### BEEF – Background Evaluation Extended Format

Defined in [BRC‑62](https://github.com/bitcoin-sv/BRCs/blob/master/transactions/0062.md), BEEF is a binary format optimized for lightweight SPV validation. It includes mined transactions, Merkle proofs, and their ancestry to enable full validation of spending transactions.

### BUMP – BSV Unified Merkle Path

From [BRC‑74](https://github.com/bitcoin-sv/BRCs/blob/master/transactions/0074.md), BUMP encodes compact Merkle proofs for multiple transactions in a single block. BEEF uses BUMP internally to provide the necessary validation data.

### SHIP & SLAP – Overlay Services Architecture

Described in [BRC‑88](https://github.com/bitcoin-sv/BRCs/blob/master/overlays/0088.md), SHIP enables nodes to advertise hosted topics and synchronize these with peers. SLAP standardizes lookup services so clients can find nodes that host specific overlays.

### UMP – User Management Protocol

UMP manages user identities via overlay transactions and uses topic managers (e.g., `tm_users`) to gatekeep inclusion. It is implemented in the [`ump-services`](https://github.com/bsv-blockchain/ump-services) project.

---

## 📦 Project Structure

```
ump-ship-slap-recovery/
├── src/
│   └── taggedBeef.ts   # main logic and CLI
├── package.json         # npm scripts and deps
├── tsconfig.json        # TypeScript config
├── .gitignore
└── README.md            # this file
```

---

## ⚙️ Components

### `src/taggedBeef.ts`

This module implements the core functionality and CLI.

* `loadTxMetaFromFile(recordType, inDir?)`
  Reads newline-delimited JSON from a file like `ump-output.json`, returning an array of transaction metadata.

* `fetchAndSaveTaggedBeef(recordType, txList, chain?, outDir?)`
  Fetches BEEF data from WhatsOnChain using `@bsv/wallet-toolbox-client`, tags it with overlay topics (`tm_users`, `tm_ship`, `tm_slap`), and writes a JSON array to `tagged_beef_<recordType>.json`.

* `broadcastTaggedBeef(recordType, filePath?, endpoint?)`
  Sends tagged BEEF entries to the overlay network using `HTTPSOverlayBroadcastFacilitator` from `@bsv/sdk`.

### CLI

You can run it directly:

```sh
node dist/taggedBeef.js <ump|ship|slap> [--prepare] [--broadcast]
```

Or use the npm scripts (recommended):

---

## 🛠 Installation

1. Install [Node.js](https://nodejs.org/) (v16+).
2. Clone the repo and install dependencies:

```sh
npm install
```

3. Compile the TypeScript:

```sh
npm run build
```

You can also use `ts-node` without compiling:

```sh
npx ts-node src/taggedBeef.ts ump --prepare
```

---

## 🔐 Environment Variable

To use your own WhatsOnChain API key:

```sh
export WOC_API_KEY=your_key_here
```

Otherwise, the default public key is used.

---

## 📥 Input Format

Each input file must be newline-delimited JSON records (e.g. `src/ump-output.json`):

```json
{"txid": "3a6f...", "outputIndex": 0}
{"txid": "b7d1...", "outputIndex": 1}
```

Files must be named:

* `ump-output.json`
* `ship-output.json`
* `slap-output.json`

---

## 🚀 Usage

### Prepare BEEF Data

```sh
npm run prepare:ump   # for UMP
npm run prepare:ship  # for SHIP
npm run prepare:slap  # for SLAP
```

For testnet:

```sh
npx ts-node src/taggedBeef.ts ump --prepare --chain test
```

### Broadcast Tagged Data

```sh
npm run broadcast:ump
npm run broadcast:ship
npm run broadcast:slap
```

You can also supply a custom endpoint in your script.

---

## 🤝 Contributing

Contributions welcome!
Please open an issue or PR if you find bugs or have suggestions.
