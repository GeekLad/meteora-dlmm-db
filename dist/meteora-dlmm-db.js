var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import initSqlJs from "sql.js";
import MeteoraDlmmStream from "./meteora-dlmm-downloader";
let SQL;
function initSql() {
    return __awaiter(this, void 0, void 0, function* () {
        if (SQL) {
            return SQL;
        }
        return initSqlJs();
    });
}
export default class MeteoraDlmmDb {
    constructor() {
        this._downloaders = new Map();
    }
    static create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = new MeteoraDlmmDb();
            yield db._init(data);
            return db;
        });
    }
    _init(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const sql = yield initSql();
            this._db = new sql.Database(data);
            if (!data) {
                this._createTables();
                this._addInitialData();
            }
            this._createStatements();
        });
    }
    _createTables() {
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
      -- Instructions --
      ------------------
      CREATE VIEW IF NOT EXISTS v_instructions AS
      WITH non_null_bins AS (
        SELECT DISTINCT
          block_time,
          pair_address,
          active_bin_id,
          LAG(active_bin_id) OVER (PARTITION BY pair_address ORDER BY block_time) AS prev_non_null_bin,
          LEAD(active_bin_id) OVER (PARTITION BY pair_address ORDER BY block_time) AS next_non_null_bin,
          LAG(block_time) OVER (PARTITION BY pair_address ORDER BY block_time) AS prev_non_null_time,
          LEAD(block_time) OVER (PARTITION BY pair_address ORDER BY block_time) AS next_non_null_time
        FROM 
          instructions
        WHERE 
          active_bin_id IS NOT NULL
      ),
      instructions_with_prev_next_bins AS (
        SELECT 
          signature,
          slot,
          block_time,
          instruction_name,
          instruction_type,
          position_address,
          pair_address,
          owner_address,
          COALESCE (
            active_bin_id,
            (SELECT active_bin_id FROM non_null_bins nnb WHERE nnb.pair_address = i.pair_address AND nnb.block_time = i.block_time LIMIT 1)
          ) active_bin_id,
          removal_bps,
          (SELECT prev_non_null_time FROM non_null_bins nnb WHERE nnb.pair_address = i.pair_address AND nnb.block_time <= i.block_time ORDER BY nnb.block_time DESC LIMIT 1) prev_non_null_time,
          (SELECT next_non_null_time FROM non_null_bins nnb WHERE nnb.pair_address = i.pair_address AND nnb.block_time >= i.block_time ORDER BY nnb.block_time ASC LIMIT 1) next_non_null_time,
          (SELECT prev_non_null_bin FROM non_null_bins nnb WHERE nnb.pair_address = i.pair_address AND nnb.block_time <= i.block_time ORDER BY nnb.block_time DESC LIMIT 1) prev_non_null_bin,
          (SELECT next_non_null_bin FROM non_null_bins nnb WHERE nnb.pair_address = i.pair_address AND nnb.block_time >= i.block_time ORDER BY nnb.block_time ASC LIMIT 1) next_non_null_bin
        FROM 
          instructions i
      )
      SELECT 
        b.signature,
        b.slot,
        b.block_time,
        b.instruction_name,
        b.instruction_type,
        b.position_address,
        b.pair_address,
        b.owner_address,
        COALESCE(
          b.active_bin_id,
          CASE 
            WHEN b.prev_non_null_time IS NOT NULL AND b.next_non_null_time IS NOT NULL 
            THEN
              CASE 
                WHEN ABS(b.block_time - prev_non_null_time) <= ABS(b.block_time - next_non_null_time) THEN prev_non_null_bin
                ELSE next_non_null_bin
              END
            WHEN b.prev_non_null_time IS NOT NULL THEN prev_non_null_bin
            ELSE next_non_null_bin
          END
        ) active_bin_id,
        removal_bps
      FROM 
        instructions_with_prev_next_bins b
        join instruction_types i ON
          b.instruction_type = i.instruction_type
      ORDER BY
        block_time,
        position_address,
        i.priority;

      ---------------
      -- Positions --
      ---------------
      CREATE VIEW IF NOT EXISTS v_positions AS
      SELECT
        DISTINCT
        i.position_address,
        i.pair_address,
        i.owner_address,
        MIN(DATETIME(i.block_time, 'unixepoch')) OVER (PARTITION BY i.position_address RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) open_block_date_time,
        MAX(DATETIME(i.block_time, 'unixepoch')) FILTER(WHERE i.instruction_type = 'close') OVER (PARTITION BY i.position_address RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) close_block_date_time,
        MAX(i.block_time) FILTER(WHERE i.instruction_type = 'close') OVER (PARTITION BY i.position_address RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) IS NULL position_is_open,
        MAX(i.block_time) FILTER(WHERE i.instruction_type = 'open') OVER (PARTITION BY i.position_address RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) IS NOT NULL all_data_received,
        p.name,
        p.bin_step,
        p.base_fee_bps / 10 base_fee_bps,
        p.mint_x,
        x.symbol AS x_symbol,
        x.decimals AS x_decimals,
        p.mint_y,
        y.symbol AS y_symbol,
        y.decimals AS y_decimals,
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
        END is_inverted
      FROM
        instructions i
      JOIN dlmm_pairs p ON
          i.pair_address = p.pair_address
      JOIN tokens x ON
          p.mint_x = x.address
      JOIN tokens y ON
          p.mint_y = y.address;

      ----------------------
      -- Raw Transactions --
      ----------------------
      CREATE VIEW IF NOT EXISTS v_raw_transactions AS
      WITH raw_transactions AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY i.position_address, i.block_time, it.priority) row_id,
          i.block_time,
          DATETIME(i.block_time, 'unixepoch') block_date_time,
          p.position_is_open,
          i.signature,
          i.pair_address,
          i.position_address,
          i.active_bin_id,
          p.name,
          p.bin_step,
          p.base_fee_bps,
          p.is_inverted,
          i.instruction_name,
          i.instruction_type,
          it.priority instruction_priority,
          POWER(1.0 + 1.0 * p.bin_step / 10000, i.active_bin_id) * POWER(10, p.x_decimals - p.y_decimals) price,
          i.removal_bps,
          COUNT(CASE WHEN i.instruction_type = 'remove' THEN 1 END) OVER (PARTITION BY i.position_address ORDER BY i.block_time)-(i.instruction_type = 'remove') position_section,
          p.mint_x,
          p.x_symbol,
          p.x_decimals,
          COALESCE(x.amount, 0) x_amount,
          x.usd_load_attempted x_usd_load_attempted,
          x.usd_amount x_usd_amount,
          0.0 x_balance,
          0.0 x_usd_balance,
          p.mint_y,
          p.y_symbol,
          p.y_decimals,
          COALESCE(y.amount, 0) y_amount,
          y.usd_load_attempted y_usd_load_attempted,
          y.usd_amount y_usd_amount,
          0.0 y_balance,
          0.0 y_usd_balance
        FROM
          v_positions p
          JOIN v_instructions i ON 
            p.position_address = i.position_address 
            AND p.pair_address = i.pair_address
          JOIN instruction_types it  ON
            i.instruction_type = it.instruction_type
          LEFT JOIN token_transfers x ON
            i.signature = x.signature 
            AND i.instruction_name = x.instruction_name 
            AND i.position_address = x.position_address
            AND p.mint_x = x.mint
          LEFT JOIN token_transfers y ON
            i.signature = y.signature 
            AND i.instruction_name = y.instruction_name 
            AND i.position_address = y.position_address
            AND p.mint_y = y.mint
        WHERE 
        	all_data_received
      ),
      balances AS (
        SELECT * FROM raw_transactions WHERE row_id = 1
        UNION ALL
        SELECT 
          rt.row_id,
          rt.block_time, 
          rt.block_date_time,
          rt.position_is_open,
          rt.signature, 
          rt.pair_address, 
          rt.position_address, 
          rt.active_bin_id, 
          rt.name, 
          rt.bin_step, 
          rt.base_fee_bps, 
          rt.is_inverted, 
          rt.instruction_name, 
          rt.instruction_type, 
          rt.instruction_priority,
          rt.price, 
          rt.removal_bps, 
          rt.position_section,
          rt.mint_x, 
          rt.x_symbol, 
          rt.x_decimals, 
          rt.x_amount, 
          rt.x_usd_load_attempted,
          rt.x_usd_amount,
          CASE 
            -- Reset the balance if we have a different position
            WHEN rt.position_address != r.position_address THEN 0
            -- Add the current amount to the prior balance
            WHEN rt.instruction_type = 'add' THEN rt.x_amount + r.x_balance
            WHEN rt.instruction_type = 'remove' THEN
              CASE
                -- If we removed 100%, we have nothing left
                WHEN rt.removal_bps = 10000 THEN 0
                -- Back into the new balance based on the removal BPS and removal amount
                ELSE (rt.x_amount / (1.0 * rt.removal_bps / 10000)) - rt.x_amount
              END
            -- Repeat the prior balance for claims & close, open we'll reset to 0
            ELSE r.x_balance
          END x_balance,
          CASE 
            -- Reset the balance if we have a different position
            WHEN rt.position_address != r.position_address THEN 0
            -- Add the current amount to the prior balance
            WHEN rt.instruction_type = 'add' THEN rt.x_usd_amount + r.x_usd_balance
            WHEN rt.instruction_type = 'remove' THEN
              CASE
                -- If we removed 100%, we have nothing left
                WHEN rt.removal_bps = 10000 THEN 0
                -- Back into the new balance based on the removal BPS and removal amount
                ELSE (rt.x_usd_amount / (1.0 * rt.removal_bps / 10000)) - rt.x_usd_amount
              END
            -- Repeat the prior balance for claims & close, open we'll reset to 0
            ELSE r.x_usd_balance
          END x_usd_balance,
          rt.mint_y, 
          rt.y_symbol, 
          rt.y_decimals, 
          rt.y_amount,
          rt.y_usd_load_attempted,
          rt.y_usd_amount,
          CASE 
            WHEN rt.position_address != r.position_address THEN 0
            WHEN rt.instruction_type = 'add' THEN rt.y_amount + r.y_balance
            WHEN rt.instruction_type = 'remove' THEN
              CASE
                WHEN rt.removal_bps = 10000 THEN 0
                ELSE (rt.y_amount / (1.0 * rt.removal_bps / 10000)) - rt.y_amount
              END
            ELSE r.y_balance
          END y_balance,
          CASE 
            -- Reset the balance if we have a different position
            WHEN rt.position_address != r.position_address THEN 0
            -- Add the current amount to the prior balance
            WHEN rt.instruction_type = 'add' THEN rt.y_usd_amount + r.y_usd_balance
            WHEN rt.instruction_type = 'remove' THEN
              CASE
                -- If we removed 100%, we have nothing left
                WHEN rt.removal_bps = 10000 THEN 0
                -- Back into the new balance based on the removal BPS and removal amount
                ELSE (rt.y_usd_amount / (1.0 * rt.removal_bps / 10000)) - rt.y_usd_amount
              END
            -- Repeat the prior balance for claims & close, open we'll reset to 0
            ELSE r.y_usd_balance
          END y_usd_balance
        FROM raw_transactions rt
        JOIN balances r ON rt.row_id = r.row_id + 1
      )
      SELECT
          block_time, 
          block_date_time,
          position_is_open,
          signature, 
          pair_address, 
          position_address, 
          active_bin_id, 
          name, 
          bin_step, 
          base_fee_bps, 
          is_inverted,
          instruction_name, 
          instruction_type, 
          price, 
          removal_bps, 
          position_section,
          mint_x, 
          x_symbol, 
          x_decimals, 
          x_amount, 
          x_usd_load_attempted,
          x_usd_amount,
          x_balance,
          x_usd_balance,
          mint_y, 
          y_symbol, 
          y_decimals, 
          y_amount,
          y_usd_load_attempted,
          y_usd_amount,
          y_balance,
          y_usd_balance
      FROM
        balances
      ORDER BY 
        block_time,
        position_address,
        instruction_priority;

      ------------------
      -- Transactions --
      ------------------

      CREATE VIEW IF NOT EXISTS v_transactions AS
      WITH transactions as (
        SELECT
          block_time,
          block_date_time,
          position_is_open,
          position_address,
          signature,
          pair_address,
          CASE WHEN NOT is_inverted THEN name ELSE y_symbol||'-'||x_symbol END name,
          bin_step,
          base_fee_bps,
          CASE WHEN NOT is_inverted THEN x_symbol ELSE y_symbol END base,
          CASE WHEN NOT is_inverted THEN mint_x ELSE mint_y END base_mint,
          CASE WHEN NOT is_inverted THEN y_symbol ELSE x_symbol END quote,
          CASE WHEN NOT is_inverted THEN mint_y ELSE mint_x END quote_mint,
          instruction_type,
          CASE WHEN NOT is_inverted THEN price ELSE 1/price END price,
          CASE WHEN NOT is_inverted THEN y_decimals ELSE x_decimals END quote_decimals,
          COALESCE (removal_bps / 10000.0, 0) removal_pct,
          COALESCE (
            CASE
              WHEN NOT is_inverted
              THEN x_amount * price + y_amount
              ELSE x_amount + y_amount / price
            END,
            0
          ) amount,
          COALESCE (x_usd_amount, 0) + COALESCE (y_usd_amount, 0) usd_amount,
          COALESCE (
            CASE
              WHEN NOT is_inverted
              THEN x_balance * price + y_balance
              ELSE x_balance + y_balance / price
            END,
            0
          ) balance,
          COALESCE (x_usd_balance, 0) + COALESCE (y_usd_balance, 0) usd_balance          
        FROM 
          v_raw_transactions
      ),
      grouped_transactions AS (
        SELECT
          block_time,
          block_date_time,
          position_is_open,
          signature,
          position_address,
          pair_address,
          name,
          bin_step,
          base_fee_bps,
          base,
          base_mint,
          quote,
          quote_mint,
          price,
          quote_decimals,
          MAX(removal_pct) removal_pct,
          SUM(CASE WHEN instruction_type = 'claim' THEN amount else 0 END) fees_claimed,
          SUM(CASE WHEN instruction_type = 'claim' THEN usd_amount else 0 END) usd_fees_claimed,
          CASE 
            WHEN COUNT(CASE WHEN instruction_type = 'add' THEN 1 END) > 0 THEN MAX(balance)
            ELSE MIN(balance)
          END balance,
          CASE 
            WHEN COUNT(CASE WHEN instruction_type = 'add' THEN 1 END) > 0 THEN MAX(usd_balance)
            ELSE MIN(usd_balance)
          END usd_balance,
          SUM(
            CASE
              WHEN instruction_type = 'add' THEN amount
              ELSE 0
            END
          ) deposits,
          SUM(
            CASE
              WHEN instruction_type = 'add' THEN usd_amount
              ELSE 0
            END
          ) usd_deposits,
          SUM(
            CASE
              WHEN instruction_type = 'remove' THEN amount
              ELSE 0
            END
          ) withdrawals,
          SUM(
            CASE
              WHEN instruction_type = 'remove' THEN usd_amount
              ELSE 0
            END
          ) usd_withdrawals,
          SUM(
            CASE
              WHEN instruction_type = 'add' THEN amount
              WHEN instruction_type = 'remove' THEN -amount
              ELSE 0
            END
          ) balance_change,
          SUM(
            CASE
              WHEN instruction_type = 'add' THEN usd_amount
              WHEN instruction_type = 'remove' THEN -usd_amount
              ELSE 0
            END
          ) usd_balance_change          
        FROM 
          transactions
        GROUP BY
          block_time,
          block_date_time,
          position_is_open,
          signature,
          pair_address,
          position_address,
          name,
          bin_step,
          base_fee_bps,
          base,
          base_mint,
          quote,
          quote_mint,
          price,
          quote_decimals
      ),
      pnl AS (
	      SELECT
					t.block_time,
					t.block_date_time,
          t.position_is_open,
					t.signature,
					t.position_address,
					t.pair_address,
					t.name,
					t.bin_step,
					t.base_fee_bps,
					t.base,
					t.base_mint,
					t.quote,
					t.quote_mint,
					t.price,
					t.quote_decimals,
					t.removal_pct,
					t.fees_claimed,
					t.usd_fees_claimed,
					t.balance,
					t.usd_balance,
	        SUM(deposits) OVER (PARTITION BY position_address ORDER BY block_time) deposits,
	        SUM(usd_deposits) OVER (PARTITION BY position_address ORDER BY block_time) usd_deposits,
	        SUM(withdrawals) OVER (PARTITION BY position_address ORDER BY block_time) withdrawals,
	        SUM(usd_withdrawals) OVER (PARTITION BY position_address ORDER BY block_time) usd_withdrawals,
					t.balance_change,
					t.usd_balance_change,
	        ROW_NUMBER() OVER (PARTITION BY position_address ORDER BY block_time) position_tx_sequence,
	        MAX(block_time) OVER (PARTITION BY position_address ORDER BY block_time)
	        -MIN(block_time) OVER (PARTITION BY position_address ORDER BY block_time) position_seconds,
	        CASE 
	 					WHEN removal_pct = 1 THEN 0
	 					ELSE COALESCE(LEAD(block_time) OVER (PARTITION BY position_address ORDER BY block_time)-block_time, 0)
	        END current_balance_seconds,
	        SUM(fees_claimed) OVER (PARTITION BY position_address ORDER BY block_time) net_fees_claimed,
	        balance - SUM(balance_change) OVER (PARTITION BY position_address ORDER BY block_time) impermanent_loss,
	        usd_balance - SUM(usd_balance_change) OVER (PARTITION BY position_address ORDER BY block_time) usd_impermanent_loss,
	        balance + SUM(fees_claimed) OVER (PARTITION BY position_address ORDER BY block_time) - SUM(balance_change) OVER (PARTITION BY position_address ORDER BY block_time) pnl,
	        usd_balance + SUM(usd_fees_claimed) OVER (PARTITION BY position_address ORDER BY block_time) - SUM(usd_balance_change) OVER (PARTITION BY position_address ORDER BY block_time) usd_pnl
	      FROM
	        grouped_transactions t      
      )
      SELECT
      	p.*,
      	(SUM(balance*current_balance_seconds) OVER (PARTITION BY position_address ORDER BY block_time))
      	/ (SUM(current_balance_seconds) OVER (PARTITION BY position_address ORDER BY block_time)) average_balance,
      	(SUM(usd_balance*current_balance_seconds) OVER (PARTITION BY position_address ORDER BY block_time))
      	/ (SUM(current_balance_seconds) OVER (PARTITION BY position_address ORDER BY block_time)) usd_average_balance      	
      FROM pnl p
      ORDER BY
        block_time,
        position_address;

      ------------------
      -- Position P&L --
      ------------------
      CREATE VIEW IF NOT EXISTS v_position_pnl AS
      WITH final_transactions AS (
	      SELECT
	        vt1.position_address,
	        vt1.base,
	        vt1.base_mint,
	        vt1.quote,
	        vt1.quote_mint,
	        vt1.position_is_open,
	        vt1.position_tx_sequence transaction_count,
	        vt1.position_seconds,
	        vt1.average_balance,
	        vt1.usd_average_balance,
	        vt1.net_fees_claimed,
	        vt1.usd_fees_claimed,
	        vt1.deposits,
	        vt1.usd_deposits,
	        vt1.withdrawals,
	        vt1.usd_withdrawals,
	        vt1.impermanent_loss,
	        vt1.usd_impermanent_loss,
	        vt1.pnl,
	        vt1.usd_pnl,
	        vt1.pnl / vt1.deposits deposits_pnl_percent,
	        vt1.usd_pnl / vt1.usd_average_balance average_balance_pnl_percent
	      FROM
	        v_transactions vt1
	      WHERE
	        vt1.position_tx_sequence = (
	          SELECT MAX(vt2.position_tx_sequence) 
	          FROM v_transactions vt2
	          WHERE vt2.position_address = vt1.position_address
	        )
      )
      SELECT 
        vp.position_address,
        vp.owner_address,
        vp.pair_address,
        vp.name,
        vp.bin_step,
        vp.base_fee_bps,
        ft.base,
        ft.base_mint,
        ft.quote,
        ft.quote_mint,
        ft.position_is_open,
        ft.transaction_count,
        ft.position_seconds,
        ft.average_balance,
        ft.usd_average_balance,
        ft.net_fees_claimed,
        ft.usd_fees_claimed,
        ft.deposits,
        ft.usd_deposits,
        ft.withdrawals,
        ft.usd_withdrawals,
        ft.impermanent_loss,
        ft.usd_impermanent_loss,
        ft.pnl,
        ft.usd_pnl,
        ft.deposits_pnl_percent,
        ft.average_balance_pnl_percent
      FROM
        v_positions vp 
        JOIN final_transactions ft on
          vp.position_address  = ft.position_address;

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
    `);
    }
    _createStatements() {
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
        this._markCompleteStatement = this._db.prepare(`
      INSERT INTO completed_accounts (account_address)
      VALUES ($account_address)
      ON CONFLICT DO NOTHING
    `);
    }
    _addInitialData() {
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
    addInstruction(instruction) {
        const { signature: $signature, slot: $slot, blockTime: $block_time, instructionName: $instruction_name, instructionType: $instruction_type, accounts, activeBinId: $active_bin_id, removalBps: $removal_bps, } = instruction;
        const { position: $position_address, lbPair: $pair_address, sender: $owner_address, } = accounts;
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
    addTransfers(instruction) {
        const { signature: $signature, instructionName: $instruction_name, accounts, } = instruction;
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
    addPair(pair) {
        const { lbPair: $pair_address, name: $name, mintX: $mint_x, mintY: $mint_y, binStep: $bin_step, baseFeeBps: $base_fee_bps, } = pair;
        this._addPairStatement.run({
            $pair_address,
            $name,
            $mint_x,
            $mint_y,
            $bin_step,
            $base_fee_bps,
        });
    }
    addToken(token) {
        const { address: $address, decimals: $decimals } = token;
        try {
            this._addTokenStatement.run({
                $address,
                $name: token.name || null,
                $symbol: token.symbol || null,
                $decimals,
                $logo: token.logoURI || null,
            });
        }
        catch (err) {
            console.error(err);
            throw err;
        }
    }
    addUsdTransactions(position_address, transactions) {
        const $position_address = position_address;
        transactions.deposits.forEach((deposit) => {
            const $instruction_type = "add";
            const { tx_id: $signature, token_x_usd_amount, token_y_usd_amount, } = deposit;
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
            const { tx_id: $signature, token_x_usd_amount, token_y_usd_amount, } = withdrawal;
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
    markComplete($account_address) {
        this._markCompleteStatement.run({ $account_address });
    }
    isComplete(account_address) {
        const completed = this._db
            .exec(`
      SELECT 
        account_address
      FROM
        completed_accounts
      WHERE
        account_address = '${account_address}'
    `)
            .map((result) => result.values)
            .flat()
            .flat();
        return completed.length == 1;
    }
    download(endpoint, account, callbacks) {
        if (this._downloaders.has(account)) {
            return this._downloaders.get(account);
        }
        if (callbacks) {
            if (callbacks.onDone) {
                const onDone = callbacks.onDone;
                callbacks.onDone = () => {
                    this._downloaders.delete(account);
                    onDone();
                };
            }
            else {
                callbacks.onDone = () => this._downloaders.delete(account);
            }
        }
        else {
            callbacks = {
                onDone: () => this._downloaders.delete(account),
            };
        }
        const stream = new MeteoraDlmmStream(this, endpoint, account, callbacks);
        this._downloaders.set(account, stream);
        return stream;
    }
    downloadStats(account) {
        var _a;
        return (_a = this._downloaders.get(account)) === null || _a === void 0 ? void 0 : _a.stats;
    }
    getMissingPairs() {
        return this._db
            .exec(`SELECT * FROM v_missing_pairs`)
            .map((result) => result.values)
            .flat()
            .flat();
    }
    getMissingTokens() {
        return this._db
            .exec(`SELECT * FROM v_missing_tokens`)
            .map((result) => result.values)
            .flat()
            .flat();
    }
    getMissingUsd() {
        return this._db
            .exec(`
        SELECT 
          DISTINCT position_address
        FROM
          v_raw_transactions
        WHERE
          COALESCE (x_amount, 0) + COALESCE (y_amount, 0) > 0
          AND (NOT x_usd_load_attempted OR NOT y_usd_load_attempted)
      `)
            .map((result) => result.values)
            .flat()
            .flat();
    }
    getMostRecentSignature(owner_address) {
        const signature = this._db
            .exec(`
        SELECT 
          signature
        FROM
          instructions i 
        WHERE
          owner_address = '${owner_address}'
        ORDER BY
          block_time DESC
        LIMIT 1        
      `)
            .map((result) => result.values)
            .flat()
            .flat();
        if (signature.length == 0) {
            return undefined;
        }
        return signature[0];
    }
    getOldestSignature(owner_address) {
        const signature = this._db
            .exec(`
        SELECT 
          signature
        FROM
          instructions i 
        WHERE
          owner_address = '${owner_address}'
        ORDER BY
          block_time
        LIMIT 1        
      `)
            .map((result) => result.values)
            .flat()
            .flat();
        if (signature.length == 0) {
            return undefined;
        }
        return signature[0];
    }
    cancelStream(account) {
        var _a;
        (_a = this._downloaders.get(account)) === null || _a === void 0 ? void 0 : _a.cancel();
        this._downloaders.delete(account);
    }
    _getAll(statement) {
        const output = [];
        while (statement.step())
            output.push(statement.getAsObject());
        statement.reset();
        return output;
    }
    export() {
        return this._db.export();
    }
    reload(data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._db.close();
            this._init(data);
        });
    }
}
//# sourceMappingURL=meteora-dlmm-db.js.map