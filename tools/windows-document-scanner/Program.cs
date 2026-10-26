using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string Origin = "https://myworkstation-app.onrender.com";
bool selfTest = args.Contains("--self-test");
if(args.Contains("--reset-pairing")){ PairTokenStore.Reset();Console.WriteLine("Η σύνδεση μηδενίστηκε. Κλείστε τυχόν παλιό παράθυρο και ανοίξτε ξανά τον σύνδεσμο.");return; }
var state = new ScannerSession(persistent:!selfTest);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions{Args=Array.Empty<string>(),EnvironmentName="Production"});
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(options => { options.Listen(IPAddress.Loopback, 17839); options.Limits.MaxRequestBodySize = 2048; options.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10); });
var app = builder.Build();
app.Use(async (context, next) => {
    var request = context.Request;
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    // Exact Host and Origin prevent DNS rebinding and browser cross-site scans.
    if (request.Host.Value != "127.0.0.1:17839" || request.Headers.Origin.ToString() != Origin) { context.Response.StatusCode = 403; return; }
    context.Response.Headers["Access-Control-Allow-Origin"] = Origin;
    context.Response.Headers["Vary"] = "Origin";
    if (request.Method == "OPTIONS") {
        context.Response.Headers["Access-Control-Allow-Methods"] = "POST";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
        context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        context.Response.StatusCode = 204; return;
    }
    if (request.Method != "POST") { context.Response.StatusCode = 405; return; }
    if (!request.HasJsonContentType()) { context.Response.StatusCode = 415; return; }
    try { await next(context); }
    catch (BadHttpRequestException) { context.Response.StatusCode = 400; }
    catch (JsonException) { context.Response.StatusCode = 400; }
});
app.MapPost("/pair", async (HttpContext context) => {
    var body = await context.Request.ReadFromJsonAsync<PairRequest>(cancellationToken:context.RequestAborted);
    var token = state.Pair(body?.code ?? "");
    return token == null ? Results.Json(new { code = "PAIR_REFUSED" }, statusCode:403) : Results.Json(new { token });
});
app.MapPost("/scan", async (HttpContext context) => {
    if (!state.Authorize(context.Request.Headers.Authorization.ToString())) return Results.Json(new { code="PAIR_REQUIRED" },statusCode:401);
    var body = await context.Request.ReadFromJsonAsync<ScanRequest>(cancellationToken:context.RequestAborted);
    if (body == null || !Guid.TryParseExact(body.requestId,"D",out _) || body.maxPages is < 1 or > 5) return Results.BadRequest();
    var result = await state.Scan(body, selfTest ? FakeScan : WiaScan, context.RequestAborted);
    return Results.Json(result.Body,statusCode:result.Status);
});
if (selfTest) {
    await app.StartAsync();
    try { await VerifyProtocol(state, Origin); Console.WriteLine("Scanner protocol HTTP self-test PASS"); }
    finally { await app.StopAsync(); await app.DisposeAsync(); }
    return;
}
if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Απαιτούνται Windows και οδηγός WIA.");
Console.WriteLine("MyWorkStation · Σύνδεσμος σαρωτή εγγράφων");
Console.WriteLine(state.IsPaired?"Η αρχική σύνδεση διατηρήθηκε. Πατήστε Σάρωση εγγράφου στο MyWorkStation.":"Κωδικός αρχικής σύνδεσης (10 λεπτά): " + state.PairCode);
Console.WriteLine("Σύνδεση μόνο από το MyWorkStation. Δεν γίνεται σάρωση πριν πατήσετε το αντίστοιχο κουμπί. Κλείστε αυτό το παράθυρο για διακοπή.");
await app.RunAsync();

static Task<string[]> FakeScan(int maxPages,CancellationToken ct) => Task.FromResult(new[]{Convert.ToBase64String(new byte[]{255,216,255,217})});

static Task<string[]> WiaScan(int maxPages, CancellationToken ct) {
    var completion = new TaskCompletionSource<string[]>(TaskCreationOptions.RunContinuationsAsynchronously);
    var thread = new Thread(() => {
        object? managerObject=null,deviceObject=null,itemObject=null;
        try {
            ct.ThrowIfCancellationRequested();
            managerObject=Activator.CreateInstance(Type.GetTypeFromProgID("WIA.DeviceManager")!);
            dynamic manager=managerObject!;
            var scanners=new List<object>();
            foreach(dynamic info in manager.DeviceInfos) { if((int)info.Type==1)scanners.Add(info);else if(Marshal.IsComObject(info))Marshal.FinalReleaseComObject(info); }
            try {
                if(scanners.Count!=1)throw new InvalidOperationException("Configure exactly one default WIA scanner.");
                deviceObject=((dynamic)scanners[0]).Connect();
            } finally { foreach(var info in scanners)if(Marshal.IsComObject(info))Marshal.FinalReleaseComObject(info); }
            dynamic device=deviceObject!;
            itemObject=device.Items[1];dynamic item=itemObject;
            SetProperty(item.Properties,6146,1); // Color: retain stamps and annotations.
            SetProperty(item.Properties,6147,300);SetProperty(item.Properties,6148,300);
            // Scan one page per explicit command; never consume unreviewed ADF
            // pages merely because more paper is present. Repeat the button to
            // append each next page to the same existing document.
            ct.ThrowIfCancellationRequested();
            object? imageObject=null;
            try {
                imageObject=item.Transfer("{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}");
                dynamic image=imageObject!;byte[] bytes=(byte[])image.FileData.BinaryData;
                ct.ThrowIfCancellationRequested();
                if(bytes.Length<4||bytes.Length>7*1024*1024||bytes[0]!=255||bytes[1]!=216||bytes[^2]!=255||bytes[^1]!=217)throw new InvalidOperationException("Invalid JPEG transfer.");
                completion.TrySetResult(new[]{Convert.ToBase64String(bytes)});
                CryptographicOperations.ZeroMemory(bytes);
            } finally { if(imageObject!=null&&Marshal.IsComObject(imageObject))Marshal.FinalReleaseComObject(imageObject); }
        } catch(OperationCanceledException) { completion.TrySetCanceled(ct); }
        catch { completion.TrySetException(new InvalidOperationException("SCAN_FAILED")); }
        finally {
            foreach(var com in new[]{itemObject,deviceObject,managerObject})if(com!=null&&Marshal.IsComObject(com))Marshal.FinalReleaseComObject(com);
        }
    });
    thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();return completion.Task;
}
static void SetProperty(dynamic properties,int id,int value) {
    foreach(dynamic property in properties)try { if((int)property.PropertyID==id){property.Value=value;return;} }catch { /* Driver may not support this optional value. */ }
}

static async Task VerifyProtocol(ScannerSession state,string origin) {
    using var http=new HttpClient{BaseAddress=new Uri("http://127.0.0.1:17839"),Timeout=TimeSpan.FromSeconds(5)};
    async Task<HttpResponseMessage> Send(string path,string? originValue,string json="{}",string? token=null,HttpMethod? method=null) {
        var request=new HttpRequestMessage(method??HttpMethod.Post,path){Content=new StringContent(json,Encoding.UTF8,"application/json")};
        if(originValue!=null)request.Headers.Add("Origin",originValue);
        if(token!=null)request.Headers.Add("Authorization","Bearer "+token);
        return await http.SendAsync(request);
    }
    static void Check(bool pass){if(!pass)throw new InvalidOperationException("Protocol assertion failed.");}
    Check((int)(await Send("/scan",null)).StatusCode==403);
    Check((int)(await Send("/scan","https://example.com")).StatusCode==403);
    Check((int)(await Send("/scan",origin)).StatusCode==401);
    Check((int)(await Send("/pair",origin,method:HttpMethod.Get)).StatusCode==405);
    Check((int)(await Send("/pair",origin,"{\"code\":\"000000x\"}")).StatusCode==403);
    var paired=await Send("/pair",origin,JsonSerializer.Serialize(new{code=state.PairCode}));Check(paired.IsSuccessStatusCode);
    var token=(await paired.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    Check((int)(await Send("/pair",origin,JsonSerializer.Serialize(new{code=state.PairCode}))).StatusCode==403);
    Check((int)(await Send("/scan",origin,"{\"requestId\":\"invalid\",\"maxPages\":1}",token)).StatusCode==400);
    var id=Guid.NewGuid().ToString("D");var json=JsonSerializer.Serialize(new{requestId=id,maxPages=1});
    var first=await Send("/scan",origin,json,token);Check(first.IsSuccessStatusCode);
    Check(await first.Content.ReadAsStringAsync()==await (await Send("/scan",origin,json,token)).Content.ReadAsStringAsync());
    Check((int)(await Send("/scan",origin,JsonSerializer.Serialize(new{requestId=id,maxPages=2}),token)).StatusCode==409);
    Check((int)(await Send("/scan",origin,JsonSerializer.Serialize(new{requestId=Guid.NewGuid().ToString(),maxPages=6}),token)).StatusCode==400);
    var pending=new TaskCompletionSource<string[]>();var command=new ScanRequest(Guid.NewGuid().ToString(),1);
    var one=state.Scan(command,(_,_)=>pending.Task,CancellationToken.None);
    Check((await state.Scan(new ScanRequest(Guid.NewGuid().ToString(),1),FakeScan,CancellationToken.None)).Status==409);
    pending.SetResult(new[]{"/9j/2Q=="});Check((await one).Status==200);
    var exhausted=new ScannerSession();for(var n=0;n<5;n++)Check(exhausted.Pair("wrong")==null);Check(exhausted.Pair(exhausted.PairCode)==null);
    var temporary=Path.Combine(Path.GetTempPath(),"mws-scanner-test-"+Guid.NewGuid().ToString("N"));
    try {
        var file=Path.Combine(temporary,"pair.bin");var firstState=new ScannerSession(true,file);var saved=firstState.Pair(firstState.PairCode)!;
        Check(new ScannerSession(true,file).Authorize("Bearer "+saved));
        Check(!File.ReadAllText(file).Contains(saved,StringComparison.Ordinal));
        File.WriteAllBytes(file,new byte[]{1,2,3});Check(!new ScannerSession(true,file).Authorize("Bearer "+saved));
    } finally { if(Directory.Exists(temporary))Directory.Delete(temporary,true); }
}

internal sealed record PairRequest(string code);
internal sealed record ScanRequest(string requestId,int maxPages);
internal sealed record ProtocolResult(int Status,object Body);
internal sealed class ScannerSession {
    readonly object gate=new();
    public string PairCode{get;}=RandomNumberGenerator.GetInt32(0,1000000).ToString("D6");
    readonly DateTimeOffset pairExpiry=DateTimeOffset.UtcNow.AddMinutes(10);
    string? token;int attempts;bool busy;string? lastId;int lastLimit;ProtocolResult? last;
    readonly HashSet<string> seen=new(StringComparer.Ordinal);
    readonly PairTokenStore? store;
    public bool IsPaired{get{lock(gate)return token!=null;}}
    public ScannerSession(bool persistent=false,string? file=null){if(persistent){store=new PairTokenStore(file);token=store.Read();}}
    public string? Pair(string code){lock(gate){if(token!=null||attempts>=5||DateTimeOffset.UtcNow>pairExpiry)return null;attempts++;if(!Equal(code,PairCode))return null;var issued=Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();store?.Save(issued);return token=issued;}}
    public bool Authorize(string value){lock(gate)return token!=null&&Equal(value,"Bearer "+token);}
    static bool Equal(string a,string b)=>CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a),Encoding.UTF8.GetBytes(b));
    public async Task<ProtocolResult> Scan(ScanRequest command,Func<int,CancellationToken,Task<string[]>> scan,CancellationToken ct){
        lock(gate){
            if(lastId==command.requestId)return lastLimit!=command.maxPages?new(409,new{code="CONFLICT"}):last??new(409,new{code="BUSY"});
            if(busy)return new(409,new{code="BUSY"});
            if(seen.Contains(command.requestId)||seen.Count>=1000)return new(409,new{code="CONFLICT"});
            seen.Add(command.requestId);busy=true;lastId=command.requestId;lastLimit=command.maxPages;last=null;
        }
        ProtocolResult result;
        try {ct.ThrowIfCancellationRequested();var pages=await scan(command.maxPages,ct);ct.ThrowIfCancellationRequested();result=new(200,new{pages=pages.Select(jpeg=>new{jpeg}).ToArray()});}
        catch {result=new(422,new{code="SCAN_FAILED"});}
        lock(gate){last=result;busy=false;}return result;
    }
}

internal sealed class PairTokenStore {
    static string DefaultFile=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MyWorkStation","DocumentScanner","pair.bin");
    readonly string file;
    public PairTokenStore(string? file=null){this.file=file??DefaultFile;}
    public string? Read(){try{
        if(!File.Exists(file)||new FileInfo(file).Length>4096)return null;
        var bytes=ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser);
        try{var value=Encoding.ASCII.GetString(bytes);return value.Length==64&&value.All(c=>c is >= '0' and <= '9' or >= 'a' and <= 'f')?value:null;}finally{CryptographicOperations.ZeroMemory(bytes);}
    }catch{return null;}}
    public void Save(string token){
        var bytes=Encoding.ASCII.GetBytes(token);try{
            var protectedBytes=ProtectedData.Protect(bytes,null,DataProtectionScope.CurrentUser);
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);File.WriteAllBytes(file+".new",protectedBytes);File.Move(file+".new",file,true);
        }finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    public static void Reset(){if(File.Exists(DefaultFile))File.Delete(DefaultFile);}
}
