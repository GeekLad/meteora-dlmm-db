import { type MeteoraDlmmInstruction } from "./meteora-instruction-parser";
import initSqlJs, { SqlJsStatic, type Database, type Statement } from "sql.js";
import {
  type MeteoraDlmmPairData,
  type MeteoraPositionTransactions,
} from "./meteora-dlmm-api";
import { type TokenMeta } from "./jupiter-token-list-api";
import MeteoraDlmmStream from "./meteora-dlmm-downloader";

interface MeteoraDlmmDbSchema {
  [column: string]:
    | number
    | boolean
    | string
    | Array<unknown>
    | Uint8Array
    | null;
}

export interface MeteoraDlmmDbTransactions extends MeteoraDlmmDbSchema {
  block_time: number;
  signature: string;
  position_address: string;
  owner_address: string;
  pair_address: string;
  base_mint: string;
  base_symbol: string;
  base_decimals: number;
  quote_mint: string;
  quote_symbol: string;
  quote_decimals: string;
  is_inverted: number;
  removal_bps: number;
  position_is_open: boolean;
  price: number;
  fee_amount: number;
  deposit: number;
  withdrawal: number;
  impermanent_loss: number;
  pnl: number;
  usd_fee_amount: number;
  usd_deposit: number;
  usd_withdrawal: number;
  usd_impermanent_loss: number;
  usd_pnl: number;
}

export interface MeteoraDlmmDbPairs extends MeteoraDlmmDbSchema {
  pair_address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  bin_step: number;
  base_fee_bps: number;
}

export interface MeteoraDlmmDbTokens extends MeteoraDlmmDbSchema {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
}

const isBrowser = new Function(
  "try {return this===window;}catch(e){ return false;}",
);

let SQL: SqlJsStatic;
async function initSql() {
  if (SQL) {
    return SQL;
  }
  SQL = isBrowser()
    ? await initSqlJs({
        locateFile: (file) =>
          `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}`,
      })
    : await initSqlJs();
  return SQL;
}

export default class MeteoraDlmmDb {
  private _db!: Database;
  private _addInstructionStatement!: Statement;
  private _addTransferStatement!: Statement;
  private _addPairStatement!: Statement;
  private _addTokenStatement!: Statement;
  private _addUsdYStatement!: Statement;
  private _addUsdXStatement!: Statement;
  private _fillMissingUsdStatement!: Statement;
  private _setOldestSignature!: Statement;
  private _markCompleteStatement!: Statement;
  private _getTransactions!: Statement;
  private _downloaders: Map<string, MeteoraDlmmStream> = new Map();

  private constructor() {}

  static async create(
    data?: ArrayLike<number> | Buffer | null,
  ): Promise<MeteoraDlmmDb> {
    const db = new MeteoraDlmmDb();
    await db._init(data);
    return db;
  }

  static async load(): Promise<MeteoraDlmmDb> {
    const { readData } = isBrowser()
      ? await import("./browser-save")
      : await import("./node-save");
    return readData();
  }

  private async _init(data?: ArrayLike<number> | Buffer | null) {
    const sql = await initSql();
    this._db = new sql.Database(data);
    if (!data) {
      this._createTables();
      this._addInitialData();
    }
    this._createStatements();
  }

  private _createTables() {
    this._db.exec(`
      ----------------
      ----------------
      ---- Tables ----
      ----------------
      ----------------

      ------------------
      -- Instructions --
      ------------------
      CREATE TABLE IF NOT EXISTS instructions (
        signature TEXT NOT NULL,
        slot INTEGER NOT NULL,
        block_time INTEGER NOT NULL,
        instruction_name TEXT NOT NULL,
        instruction_type TEXT NOT NULL,
        position_address TEXT NOT NULL,
        pair_address TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        active_bin_id INTEGER,
        removal_bps INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_instructions_signature_instruction_name_position_address
      ON instructions (
        signature, 
        instruction_name, 
        position_address
      );
      CREATE INDEX IF NOT EXISTS instructions_position_address ON instructions (position_address);
      CREATE INDEX IF NOT EXISTS instructions_block_time ON instructions (block_time);
      CREATE INDEX IF NOT EXISTS instructions_signature ON instructions (signature);

      ---------------------
      -- Token Transfers --
      ---------------------
      CREATE TABLE IF NOT EXISTS token_transfers (
        signature TEXT NOT NULL,
        instruction_name TEXT NOT NULL,
        position_address TEXT NOT NULL,
        mint TEXT NOT NULL,
        amount REAL NOT NULL,
        usd_load_attempted NUMERIC DEFAULT (0) NOT NULL, 
        usd_amount REAL,
        FOREIGN KEY (
          signature, 
          instruction_name, 
          position_address
        ) REFERENCES instructions (
          signature, 
          instruction_name, 
          position_address
        ) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_token_transfers_signature_instruction_name_position_address_mint
      ON token_transfers (
        signature, 
        instruction_name, 
        position_address, 
        mint
      );
      CREATE INDEX IF NOT EXISTS token_transfers_position_address ON token_transfers (position_address);

      ----------------
      -- DLMM Pairs --
      ----------------
      CREATE TABLE IF NOT EXISTS dlmm_pairs (
        pair_address TEXT NOT NULL,
        name TEXT NOT NULL,
        mint_x TEXT NOT NULL,
        mint_y TEXT NOT NULL,
        bin_step INTEGER NOT NULL,
        base_fee_bps INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS dlmm_pairs_pair_address
      ON dlmm_pairs (pair_address);

      ------------
      -- Tokens --
      ------------
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT NOT NULL,
        name TEXT,
        symbol TEXT,
        decimals INTEGER NOT NULL,
        logo TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tokens_address
      ON tokens (address);

      ------------------
      -- Quote Tokens --
      ------------------
      CREATE TABLE IF NOT EXISTS quote_tokens (
        priority INTEGER NOT NULL,
        mint TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS quote_tokens_priority
      ON quote_tokens (priority);
      CREATE UNIQUE INDEX IF NOT EXISTS quote_tokens_mint
      ON quote_tokens (mint);

      ------------------------
      -- Completed Accounts --
      ------------------------
      CREATE TABLE IF NOT EXISTS completed_accounts (
        account_address TEXT NOT NULL,
        completed INTEGER DEFAULT (0) NOT NULL, 
        oldest_block_time INTEGER, 
        oldest_signature TEXT,
        CONSTRAINT completed_accounts_account_address PRIMARY KEY (account_address)
      );

      -----------------
      -- Token Types --
      -----------------
      CREATE TABLE IF NOT EXISTS instruction_types (
        priority INTEGER NOT NULL,
        instruction_type INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS instruction_types_priority
      ON instruction_types (priority);
      CREATE UNIQUE INDEX IF NOT EXISTS instruction_types_instruction_type
      ON instruction_types (instruction_type);

      --------------------------------------------------------------------------

      ---------------
      ---------------
      ---- Views ----
      ---------------
      ---------------

      ------------------
      -- Transactions --
      ------------------
      CREATE VIEW IF NOT EXISTS v_transactions AS
      WITH instructions_with_active_bin_id_groups AS (
        SELECT
          i.block_time,
          i.signature,
          i.instruction_type,
          i.position_address,
          i.owner_address,
          p.pair_address,
          p.bin_step,
          p.base_fee_bps,
          x.address x_mint,
          x.symbol x_symbol,
          x.decimals x_decimals,
          y.address y_mint,
          y.symbol y_symbol,
          y.decimals y_decimals,
          CASE
            WHEN (SELECT q.priority FROM quote_tokens q WHERE q.mint = p.mint_x) IS NULL 
            THEN FALSE
            WHEN
              (SELECT q.priority FROM quote_tokens q WHERE q.mint = p.mint_x) IS NOT NULL
              AND (SELECT q.priority FROM quote_tokens q WHERE q.mint = p.mint_y) IS NULL
            THEN TRUE
            WHEN
              (SELECT q.priority FROM quote_tokens q WHERE q.mint = p.mint_x) < (SELECT q.priority FROM quote_tokens q WHERE q.mint = p.mint_y)
            THEN TRUE
            ELSE FALSE
          END is_inverted,          
          i.active_bin_id,
          SUM(CASE WHEN i.active_bin_id IS NOT NULL THEN 1 ELSE 0 END) OVER (PARTITION BY p.pair_address ORDER BY i.block_time) prev_group_id,
          SUM(CASE WHEN i.active_bin_id IS NOT NULL THEN 1 ELSE 0 END) OVER (PARTITION BY p.pair_address ORDER BY i.block_time DESC) next_group_id,
          COALESCE(i.removal_bps, 0) removal_bps,
          MAX(CASE WHEN i.instruction_type = 'close' THEN 1 END) OVER (PARTITION BY i.position_address RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) IS NULL position_is_open,
          COALESCE(ttx.amount, 0) x_amount,
          COALESCE(tty.amount, 0) y_amount,
          COALESCE(ttx.usd_amount, 0) + COALESCE(tty.usd_amount, 0) usd_amount
        FROM
          instructions i
          JOIN instruction_types it ON
            i.instruction_type = it.instruction_type 
          JOIN dlmm_pairs p ON
            p.pair_address = i.pair_address 
          JOIN tokens x ON
            p.mint_x = x.address
          JOIN tokens y ON
            p.mint_y = y.address
          LEFT JOIN token_transfers ttx ON
            ttx.signature = i.signature
            AND ttx.position_address = i.position_address
            AND ttx.instruction_name = i.instruction_name 
            AND ttx.mint = x.address
          LEFT JOIN token_transfers tty ON
            tty.signature = i.signature
            AND tty.position_address = i.position_address
            AND tty.instruction_name = i.instruction_name 
            AND tty.mint = y.address
        ORDER BY
            p.pair_address, i.block_time
      ),
      instructions_with_contiguous_active_bin_ids AS (
        SELECT
          block_time - MIN(block_time) FILTER (WHERE active_bin_id IS NOT NULL) OVER (PARTITION BY pair_address, prev_group_id ORDER BY block_time) prev_block_time_diff,
          MAX(active_bin_id) FILTER (WHERE active_bin_id IS NOT NULL) OVER (PARTITION BY pair_address, prev_group_id ORDER BY block_time) prev_active_bin_id,
          MIN(block_time) FILTER (WHERE active_bin_id IS NOT NULL) OVER (PARTITION BY pair_address, next_group_id ORDER BY block_time DESC) - block_time next_block_time_diff,
          MIN(active_bin_id) FILTER (WHERE active_bin_id IS NOT NULL) OVER (PARTITION BY pair_address, next_group_id ORDER BY block_time DESC) next_active_bin_id,
          *
        FROM
          instructions_with_active_bin_id_groups
      ),
      backfilled_active_bin_ids AS (
        SELECT
          block_time,
          signature,
          instruction_type,
          position_address,
          owner_address,
          pair_address,
          bin_step,
          base_fee_bps,
          x_mint,
          x_symbol,
          x_decimals,
          y_mint,
          y_symbol,
          y_decimals,
          is_inverted,
          COALESCE (
            active_bin_id,
            CASE 
              WHEN prev_block_time_diff IS NOT NULL and next_block_time_diff IS NOT NULL THEN
                CASE 
                  WHEN prev_block_time_diff <= next_block_time_diff THEN prev_active_bin_id
                  ELSE next_active_bin_id
                END
              ELSE COALESCE (prev_active_bin_id, next_active_bin_id)
            END			
          ) active_bin_id,
          removal_bps,
          position_is_open,
          x_amount,
          y_amount,
          usd_amount
        FROM
            instructions_with_contiguous_active_bin_ids
      ),
      prices AS (
        SELECT
          block_time,
          signature,
          instruction_type,
          position_address,
          owner_address,
          pair_address,
          base_fee_bps,
          CASE 
          	WHEN NOT is_inverted THEN x_mint
          	ELSE y_mint
          END base_mint,
          CASE 
          	WHEN NOT is_inverted THEN x_symbol
          	ELSE y_symbol
          END base_symbol,
          CASE 
          	WHEN NOT is_inverted THEN x_decimals
          	ELSE y_decimals
          END base_decimals,
          CASE 
          	WHEN NOT is_inverted THEN y_mint
          	ELSE x_mint
          END quote_mint,
          CASE 
          	WHEN NOT is_inverted THEN y_symbol
          	ELSE x_symbol
          END quote_symbol,
          CASE 
          	WHEN NOT is_inverted THEN y_decimals
          	ELSE x_decimals
          END quote_decimals,
          is_inverted,
          removal_bps,
          position_is_open,
          CASE 
            WHEN NOT is_inverted THEN POWER(1.0 + 1.0 * bin_step / 10000, active_bin_id) * POWER(10, x_decimals - y_decimals)
            ELSE 1 / (POWER(1.0 + 1.0 * bin_step / 10000, active_bin_id) * POWER(10, x_decimals - y_decimals))
          END price,
          CASE
            WHEN NOT is_inverted THEN x_amount
            ELSE y_amount
          END base_amount,
          CASE
            WHEN NOT is_inverted THEN y_amount
            ELSE x_amount
          END quote_amount,
          usd_amount
        FROM
          backfilled_active_bin_ids
      ),
      instructions_with_base_quote as (
        SELECT
          block_time,
          signature,
          instruction_type,
          position_address,
          owner_address,
          pair_address,
          base_mint,
          base_symbol,
          base_decimals,
          quote_mint,
          quote_symbol,
          quote_decimals,
          is_inverted,
          removal_bps,
          position_is_open,
          price,
          price * base_amount + quote_amount amount,
          usd_amount
        FROM
          prices
      ),
      transactions AS (
	      SELECT
          block_time,
          signature,
          position_address,
          owner_address,
          pair_address,
          base_mint,
          base_symbol,
          base_decimals,
          quote_mint,
          quote_symbol,
          quote_decimals,
          is_inverted,
          MAX(removal_bps) removal_bps,
          MAX(position_is_open) position_is_open,
          price,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'claim' THEN price * base_amount + quote_amount 
                ELSE 0 
              END
            ),
            0
          ) fee_amount,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'add' THEN price * base_amount + quote_amount
                ELSE 0
              END
            ),
            0
          ) deposit,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'remove' THEN price * base_amount + quote_amount
                ELSE 0
              END
            ),
            0
          ) withdrawal,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'claim' THEN usd_amount 
                ELSE 0 
              END
            ),
            0
          ) usd_fee_amount,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'add' THEN usd_amount		
              END
            ),
            0
          ) usd_deposit,
          COALESCE(
            SUM(
              CASE 
                WHEN instruction_type = 'remove' THEN usd_amount
              END
            ),
            0
          ) usd_withdrawal          
      FROM
        prices
      GROUP BY
        block_time,
        signature,
        position_address,
        owner_address,
        pair_address
      ),
      balance_change_groups AS (
	      SELECT 
	      	*,
	        SUM(CASE WHEN removal_bps > 0 THEN 1 ELSE 0 END) OVER (PARTITION BY position_address ORDER BY block_time) position_group_id
	    	FROM 
	    		transactions
      ),
      balances AS (
	      SELECT
	      	block_time,
	      	signature,
	      	position_address,
	      	owner_address,
	      	pair_address,
          base_mint,
          base_symbol,
          base_decimals,
          quote_mint,
          quote_symbol,
          quote_decimals,
          is_inverted,          
	      	removal_bps,
	        position_is_open,
	      	price,
	        MAX(block_time) OVER (PARTITION BY position_address ORDER BY block_time)
	        -MIN(block_time) OVER (PARTITION BY position_address ORDER BY block_time) position_seconds,	      	
	        CASE 
	 					WHEN removal_bps = 10000 THEN 0
	 					ELSE COALESCE(LEAD(block_time) OVER (PARTITION BY position_address ORDER BY block_time)-block_time, 0)
	        END position_balance_seconds,
	      	fee_amount,
	      	deposit,
	      	withdrawal,
	      	CASE
	      		WHEN removal_bps = 0 THEN
		  	    	SUM(
			      		CASE 
				      		WHEN deposit >= 0 THEN deposit 
				      		ELSE 0
			    			END
			    		) OVER (
			    			PARTITION BY position_address, position_group_id ORDER BY block_time
			    		)
			    	WHEN removal_bps = 10000 THEN 0
			    	ELSE withdrawal * (1.0 * 10000 / removal_bps - 1)
	      	END position_balance,
	      	usd_fee_amount,
	      	usd_deposit,
	      	usd_withdrawal,
	      	CASE
	      		WHEN removal_bps = 0 THEN
		  	    	SUM(
			      		CASE 
				      		WHEN usd_deposit > 0 THEN usd_deposit 
				      		ELSE 0
			    			END
			    		) OVER (
			    			PARTITION BY position_address, position_group_id ORDER BY block_time
			    		)
			    	WHEN removal_bps = 10000 THEN 0
			    	ELSE usd_withdrawal * (1.0 * removal_bps / 10000 - 1)
	      	END usd_position_balance
	      FROM
	      	balance_change_groups
	    	ORDER BY
	    		position_address, block_time
      ),
      pnl AS (
	      SELECT
	      	block_time,
	      	signature,
	      	position_address,
	      	owner_address,
	      	pair_address,
          base_mint,
          base_symbol,
          base_decimals,
          quote_mint,
          quote_symbol,
          quote_decimals,
          is_inverted,
	      	removal_bps,
	        position_is_open,
	      	price,
	      	fee_amount,
	      	deposit,
	      	withdrawal,
	        position_balance - SUM(deposit-withdrawal) OVER (PARTITION BY position_address ORDER BY block_time) cumulative_position_impermanent_loss,
	        SUM(fee_amount) OVER (PARTITION BY position_address ORDER BY block_time) + position_balance - SUM(deposit-withdrawal) OVER (PARTITION BY position_address ORDER BY block_time) cumulative_pnl,
	      	usd_fee_amount,
	      	usd_deposit,
	      	usd_withdrawal,
	        usd_position_balance - SUM(usd_deposit-usd_withdrawal) OVER (PARTITION BY position_address ORDER BY block_time) usd_cumulative_position_impermanent_loss,
	        SUM(usd_fee_amount) OVER (PARTITION BY position_address ORDER BY block_time) + usd_position_balance - SUM(usd_deposit-usd_withdrawal) OVER (PARTITION BY position_address ORDER BY block_time) usd_cumulative_pnl
				FROM balances
      )
      SELECT 
      	block_time,
      	signature,
      	position_address,
      	owner_address,
      	pair_address,
        base_mint,
        base_symbol,
        base_decimals,
        quote_mint,
        quote_symbol,
        quote_decimals,
        is_inverted,
      	removal_bps,
        position_is_open,
      	price,
      	fee_amount,
      	deposit,
      	withdrawal,
        cumulative_position_impermanent_loss - COALESCE(LAG(cumulative_position_impermanent_loss) OVER (PARTITION BY position_address ORDER BY block_time), 0) impermanent_loss,
        cumulative_pnl - COALESCE(LAG(cumulative_pnl) OVER (PARTITION BY position_address ORDER BY block_time), 0) pnl,
      	usd_fee_amount,
      	usd_deposit,
      	usd_withdrawal,
        usd_cumulative_position_impermanent_loss - COALESCE(LAG(usd_cumulative_position_impermanent_loss) OVER (PARTITION BY position_address ORDER BY block_time), 0) usd_impermanent_loss,
        usd_cumulative_pnl - COALESCE(LAG(usd_cumulative_pnl) OVER (PARTITION BY position_address ORDER BY block_time), 0) usd_pnl
      FROM pnl
			ORDER BY
				block_time,
				position_address;

      -------------------
      -- Missing Pairs --
      -------------------
      CREATE VIEW IF NOT EXISTS v_missing_pairs AS
      SELECT DISTINCT 
        i.pair_address
      FROM
        instructions i 
        LEFT JOIN dlmm_pairs p ON
          i.pair_address = p.pair_address 
      WHERE 
        p.pair_address IS NULL;

      --------------------
      -- Missing Tokens --
      --------------------
      CREATE VIEW IF NOT EXISTS v_missing_tokens AS
      SELECT DISTINCT address FROM (
        SELECT
          p.mint_x address
        FROM
          instructions i 
          JOIN dlmm_pairs p ON
            i.pair_address = p.pair_address 
          LEFT JOIN tokens x ON
            p.mint_x  = x.address 
        WHERE 
          x.address IS NULL
        UNION
        SELECT 
          p.mint_y
        FROM
          instructions i 
          JOIN dlmm_pairs p ON
            i.pair_address = p.pair_address 
          LEFT JOIN tokens y ON
            p.mint_y  = y.address 
        WHERE 
          y.address IS NULL
      );

      -----------------
      -- Missing USD --
      -----------------
      CREATE VIEW IF NOT EXISTS v_missing_usd AS
      SELECT 
        position_address
      FROM
        token_transfers
      GROUP BY
        position_address
      HAVING
        SUM(usd_load_attempted) <> COUNT(*);
    `);
  }

  private _createStatements() {
    this._addInstructionStatement = this._db.prepare(`
      INSERT INTO instructions(
        signature, 
        slot, 
        block_time, 
        instruction_name,
        instruction_type,
        position_address,
        pair_address,
        owner_address,
        active_bin_id,
        removal_bps
      )
      VALUES(
        $signature, 
        $slot, 
        $block_time, 
        $instruction_name, 
        $instruction_type, 
        $position_address, 
        $pair_address, 
        $owner_address,
        $active_bin_id,
        $removal_bps
      )
      ON CONFLICT DO NOTHING
    `);
    this._addTransferStatement = this._db.prepare(`
      INSERT INTO token_transfers(
        signature,
        instruction_name,
        position_address,
        mint,
        amount
      )
      VALUES (
        $signature,
        $instruction_name,
        $position_address,
        $mint,
        $amount
      )
      ON CONFLICT DO NOTHING
    `);
    this._addPairStatement = this._db.prepare(`
      INSERT INTO dlmm_pairs(
        pair_address,
        name,
        mint_x,
        mint_y,
        bin_step,
        base_fee_bps
      )
      VALUES (
        $pair_address,
        $name,
        $mint_x,
        $mint_y,
        $bin_step,
        $base_fee_bps
      )
      ON CONFLICT DO NOTHING
    `);
    this._addTokenStatement = this._db.prepare(`
      INSERT INTO tokens(
        address,
        name,
        symbol,
        decimals,
        logo
      )
      VALUES (
        $address,
        $name,
        $symbol,
        $decimals,
        $logo
      )
      ON CONFLICT DO NOTHING
    `);
    this._addUsdXStatement = this._db.prepare(`
      UPDATE token_transfers
      SET 
        usd_load_attempted = 1,
        usd_amount = $amount
      WHERE EXISTS (
        SELECT 
          1
        FROM
          token_transfers t
          JOIN instructions i ON
            i.signature = t.signature
            AND i.instruction_name = t.instruction_name
            AND i.position_address = t.position_address
          JOIN dlmm_pairs p ON
            i.pair_address = p.pair_address
        WHERE
          t.signature = $signature
          AND token_transfers.signature = t.signature
          AND token_transfers.instruction_name = t.instruction_name
          AND token_transfers.position_address = $position_address
      		AND token_transfers.mint = p.mint_x
          AND i.instruction_type = $instruction_type
      )      
    `);
    this._addUsdYStatement = this._db.prepare(`
      UPDATE token_transfers
      SET 
        usd_load_attempted = 1,
        usd_amount = $amount
      WHERE EXISTS (
        SELECT 
          1
        FROM
          token_transfers t
          JOIN instructions i ON
            i.signature = t.signature
            AND i.instruction_name = t.instruction_name
            AND i.position_address = t.position_address
          JOIN dlmm_pairs p ON
            i.pair_address = p.pair_address
        WHERE
          t.signature = $signature
          AND token_transfers.signature = t.signature
          AND token_transfers.instruction_name = t.instruction_name
          AND token_transfers.position_address = $position_address
      		AND token_transfers.mint = p.mint_y
          AND i.instruction_type = $instruction_type
      )      
    `);
    this._fillMissingUsdStatement = this._db.prepare(`
      UPDATE token_transfers
      SET 
        usd_load_attempted = 1
      WHERE EXISTS (
        SELECT 
          1
        FROM
          token_transfers t
        WHERE
          t.position_address = token_transfers.position_address
          AND token_transfers.usd_load_attempted = 0
          AND t.position_address = $position_address
      )   
    `);
    this._setOldestSignature = this._db.prepare(`
      INSERT INTO completed_accounts (account_address, oldest_block_time, oldest_signature)
      VALUES ($account_address, $oldest_block_time, $oldest_signature)
      ON CONFLICT DO UPDATE
      SET 
      	account_address = $account_address,
      	oldest_block_time = $oldest_block_time,
        oldest_signature = $oldest_signature
    `);
    this._markCompleteStatement = this._db.prepare(`
      INSERT INTO completed_accounts (account_address, completed)
      VALUES ($account_address, 1)
      ON CONFLICT DO UPDATE
      SET 
      	account_address = $account_address,
      	completed = 1
    `);
    this._getTransactions = this._db.prepare(`
      SELECT * FROM v_transactions
    `);
  }

  private _addInitialData() {
    this._db.run(`
      INSERT INTO quote_tokens (priority,mint) VALUES
        (1,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        (2,'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
        (3,'So11111111111111111111111111111111111111112')
      ON CONFLICT DO NOTHING
    `);
    this._db.run(`
      INSERT INTO instruction_types (priority,instruction_type) VALUES
        (1,'open'),
        (2,'add'),
        (3,'claim'),
        (4,'remove'),
        (5,'close')
      ON CONFLICT DO NOTHING
    `);
  }

  addInstruction(instruction: MeteoraDlmmInstruction) {
    const {
      signature: $signature,
      slot: $slot,
      blockTime: $block_time,
      instructionName: $instruction_name,
      instructionType: $instruction_type,
      accounts,
      activeBinId: $active_bin_id,
      removalBps: $removal_bps,
    } = instruction;
    const {
      position: $position_address,
      lbPair: $pair_address,
      sender: $owner_address,
    } = accounts;
    this._addInstructionStatement.run({
      $signature,
      $slot,
      $block_time,
      $instruction_name,
      $instruction_type,
      $position_address,
      $pair_address,
      $owner_address,
      $active_bin_id,
      $removal_bps,
    });
    this.addTransfers(instruction);
  }

  addTransfers(instruction: MeteoraDlmmInstruction) {
    const {
      signature: $signature,
      instructionName: $instruction_name,
      accounts,
    } = instruction;
    const { position: $position_address } = accounts;
    const transfers = instruction.tokenTransfers;
    transfers.forEach((transfer) => {
      const { mint: $mint, amount: $amount } = transfer;
      this._addTransferStatement.run({
        $signature,
        $instruction_name,
        $position_address,
        $mint,
        $amount,
      });
    });
  }

  addPair(pair: MeteoraDlmmPairData) {
    const {
      lbPair: $pair_address,
      name: $name,
      mintX: $mint_x,
      mintY: $mint_y,
      binStep: $bin_step,
      baseFeeBps: $base_fee_bps,
    } = pair;
    this._addPairStatement.run({
      $pair_address,
      $name,
      $mint_x,
      $mint_y,
      $bin_step,
      $base_fee_bps,
    });
  }

  addToken(token: TokenMeta) {
    const { address: $address, decimals: $decimals } = token;
    try {
      this._addTokenStatement.run({
        $address,
        $name: token.name || null,
        $symbol: token.symbol || null,
        $decimals,
        $logo: token.logoURI || null,
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  addUsdTransactions(
    position_address: string,
    transactions: MeteoraPositionTransactions,
  ) {
    const $position_address = position_address;
    transactions.deposits.forEach((deposit) => {
      const $instruction_type = "add";
      const {
        tx_id: $signature,
        token_x_usd_amount,
        token_y_usd_amount,
      } = deposit;
      this._addUsdXStatement.run({
        $instruction_type,
        $amount: token_x_usd_amount,
        $signature,
        $position_address,
      });
      this._addUsdYStatement.run({
        $instruction_type,
        $amount: token_y_usd_amount,
        $signature,
        $position_address,
      });
    });
    transactions.withdrawals.forEach((withdrawal) => {
      const $instruction_type = "remove";
      const {
        tx_id: $signature,
        token_x_usd_amount,
        token_y_usd_amount,
      } = withdrawal;
      this._addUsdXStatement.run({
        $instruction_type,
        $amount: token_x_usd_amount,
        $signature,
        $position_address,
      });
      this._addUsdYStatement.run({
        $instruction_type,
        $amount: token_y_usd_amount,
        $signature,
        $position_address,
      });
    });
    transactions.fees.forEach((fee) => {
      const $instruction_type = "claim";
      const { tx_id: $signature, token_x_usd_amount, token_y_usd_amount } = fee;
      this._addUsdXStatement.run({
        $instruction_type,
        $amount: token_x_usd_amount,
        $signature,
        $position_address,
      });
      this._addUsdYStatement.run({
        $instruction_type,
        $amount: token_y_usd_amount,
        $signature,
        $position_address,
      });
    });
    this._fillMissingUsdStatement.run({
      $position_address: position_address,
    });
  }

  setOldestSignature(
    $account_address: string,
    $oldest_block_time: number,
    $oldest_signature: string,
  ) {
    this._setOldestSignature.run({
      $account_address,
      $oldest_block_time,
      $oldest_signature,
    });
  }

  markComplete($account_address: string) {
    this._markCompleteStatement.run({ $account_address });
  }

  isComplete(account_address: string): boolean {
    const completed = this._db
      .exec(
        `
      SELECT 
        account_address
      FROM
        completed_accounts
      WHERE
        account_address = '${account_address}'
        AND completed
    `,
      )
      .map((result) => result.values)
      .flat()
      .flat();

    return completed.length == 1;
  }

  download(
    endpoint: string,
    account: string,
    callbacks?: {
      onDone?: (...args: any[]) => any;
    },
  ): MeteoraDlmmStream {
    if (this._downloaders.has(account)) {
      return this._downloaders.get(account)!;
    }
    if (callbacks) {
      if (callbacks.onDone) {
        const onDone = callbacks.onDone;
        callbacks.onDone = () => {
          this._downloaders.delete(account);
          onDone();
        };
      } else {
        callbacks.onDone = () => this._downloaders.delete(account);
      }
    } else {
      callbacks = {
        onDone: () => this._downloaders.delete(account),
      };
    }
    const stream = new MeteoraDlmmStream(this, endpoint, account, callbacks);
    this._downloaders.set(account, stream);
    return stream;
  }

  getMissingPairs(): string[] {
    return this._db
      .exec(`SELECT * FROM v_missing_pairs`)
      .map((result) => result.values)
      .flat()
      .flat() as string[];
  }

  getMissingTokens(): string[] {
    return this._db
      .exec(`SELECT * FROM v_missing_tokens`)
      .map((result) => result.values)
      .flat()
      .flat() as string[];
  }

  getMissingUsd(): string[] {
    return this._db
      .exec(`SELECT * FROM v_missing_usd`)
      .map((result) => result.values)
      .flat()
      .flat() as string[];
  }

  getMostRecentSignature(owner_address: string): string | undefined {
    const signature = this._db
      .exec(
        `
        SELECT 
          signature
        FROM
          instructions i 
        WHERE
          owner_address = '${owner_address}'
        ORDER BY
          block_time DESC
        LIMIT 1        
      `,
      )
      .map((result) => result.values)
      .flat()
      .flat();

    if (signature.length == 0) {
      return undefined;
    }
    return signature[0] as string;
  }

  getOldestSignature(owner_address: string): string | undefined {
    const signature = this._db
      .exec(
        `
          WITH signatures AS (
            SELECT 
              block_time, signature
            FROM
              instructions
            WHERE
              owner_address = '${owner_address}'
            UNION
            SELECT
              oldest_block_time, oldest_signature
            FROM
              completed_accounts
            WHERE
              account_address = '${owner_address}'
          )
          SELECT
            signature
          FROM
            signatures
          ORDER BY
            block_time 
          LIMIT 1    
      `,
      )
      .map((result) => result.values)
      .flat()
      .flat();

    if (signature.length == 0) {
      return undefined;
    }
    return signature[0] as string;
  }

  getTransactions(): MeteoraDlmmDbTransactions[] {
    return this._getAll(this._getTransactions);
  }

  async cancelDownload(account: string) {
    this._downloaders.get(account)?.cancel();
    this._downloaders.delete(account);
    await this.save();
  }

  private _getAll<MeteoraDlmmDbSchema>(
    statement: Statement,
  ): MeteoraDlmmDbSchema[] {
    const output: MeteoraDlmmDbSchema[] = [];
    while (statement.step())
      output.push(statement.getAsObject() as MeteoraDlmmDbSchema);
    statement.reset();
    return output;
  }

  async save(): Promise<void> {
    const data = this._db.export();
    this._db.close();
    await this._init(data);

    const { writeData } = isBrowser()
      ? await import("./browser-save")
      : await import("./node-save");
    await writeData(data);
  }
}
