  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "InvoiceDraftAlias"`))[0].n,0);
 }finally{await f.close()}}
});
