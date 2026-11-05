from pathlib import Path
p=Path('server/test/store-invoice-entry-mounted.test.mjs')
s=p.read_text()
a='setup(b){b.onLoad({filter:/\\.jsx$/}'
b='''setup(b){b.onLoad({filter:/invoice-assistant-pdf-viewer\\.js$/},()=>({contents:'export async function mountInvoicePdfViewer(){globalThis.__task3PdfViewerCalls=(globalThis.__task3PdfViewerCalls||0)+1;throw new Error("PDF rendering is forbidden in this isolated navigation test")}',loader:"js"}));b.onLoad({filter:/\\.jsx$/}'''
assert s.count(a)==1
s=s.replace(a,b,1)
a='"clearInterval","fetch"';assert s.count(a)==1;s=s.replace(a,'"clearInterval","fetch","__task3PdfViewerCalls"',1)
a='  }finally{stopNative();';assert s.count(a)==1;s=s.replace(a,'    assert.equal(globalThis.__task3PdfViewerCalls||0,0,"no PDF viewer or worker may run");\n'+a,1)
s=s.replace('// and the wholesale in-flight signal are fixtures; transport is isolated, never hosted.','// and the wholesale in-flight signal are fixtures; transport is isolated, never hosted.\n// The unrelated PDF renderer is an explicit throw-on-call fixture; no worker is run.')
p.write_text(s)
