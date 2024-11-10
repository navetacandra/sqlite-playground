import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export async function initializeSQLite3() {
  try {
    const sqlite3 = await sqlite3InitModule({ print: console.log, printErr: console.error });
    const db = 'opfs' in sqlite3 
      ? new sqlite3.oo1.OpfsDb('db.sqlite')
      : new sqlite3.oo1.DB('db.sqlite', 'ct');
    return db;
  } catch(err) {
    console.error(err);
  }
}
