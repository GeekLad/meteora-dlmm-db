# Meteora DLMM Transaction Database

## Overview

This library is intended to help anyone interested in downloading, parsing, and
analyzing market making transactions in [Meteora DLMM Pools](https://app.meteora.ag).
A great use case for this library is the [Meteora DLMM Profit Analysis Tool](https://github.com/GeekLad/meteora-profit-analysis). The library was created to save parsed transaction
data in the browser, to speed up future loads of the tool since only the newest
transactions would need to be downloaded. The transactions are stored in a
SQLite database, and in NodeJS environments they are persisted in a local file
and in Browser environments they are persisted in the IndexedDb (using
[Dexie.js](https://dexie.org/)).

## Features

- Downloads and parses Meteora DLMM transactions from the blockchain
- Downloads Meteora DLMM transactions from the [Meteora DLMM API](https://dlmm-api.meteora.ag/swagger-ui/#/), to obtain
  estimated USD values of transactions
- Persists data in a [SQLite](https://sqlite.org) database
- SQLite database can be persisted both in NodeJS and browser environments

## Installation

Add the library with your favorite package manager:

### npm

```sh
npm add git@github.com:GeekLad/meteora-dlmm-db
```

### yarn

```sh
yarn add git@github.com:GeekLad/meteora-dlmm-db
```

### bun

```sh
bun add git@github.com:GeekLad/meteora-dlmm-db
```

### Using in a Browser

To use it in a browser, you'll need to configure your bundling tool to stub the
`fs` package. In the Meteora DLMM Profit Analysis Tool, the `next.config.js`
file looks like this:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  productionBrowserSourceMaps: true,
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
    };
    return config;
  },
};

module.exports = nextConfig;
```

## Usage

### Instantiation

To create a new database instance:

```ts
const db = await MeteoraDlmmDb.create();
```

To load an existing database instance:

```ts
const db = await MeteoraDlmmDb.load();
```

**Note**: If you use the `.load()` method and the database doesn't exist, it
will create it for you. If you call the `.create()` method and there is an
existing databse, it will be overwritten with a new, blank databse.

### Download Transactions

To download transactions:

```ts
const downloader = db.download({
  rpc: "<Valid RPC URL goes here>",
  account: "<Valid Solana Wallet Address goes here>",
});
```

This creates a downloader instance, which has some properties & methods you can
use to control the download process. To cancel the download:

```ts
db.cancel();
```

This will stop the downloader from downloading anymore transactions from the
blockchain. However, it will continue to download the USD values for the
transactions from the [Meteora API](https://dlmm-api.meteora.ag/swagger-ui/#/).
If you make a second call to the `.cancel()` method, it will terminate the
downloading of the UDS values from the API.

### Reading from the Database

To read all transactions:

```ts
db.getTransactions();
```

This will read the data from the `v_transactions` view in the database.
