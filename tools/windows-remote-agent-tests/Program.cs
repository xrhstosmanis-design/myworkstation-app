using MyWorkStation.RemoteAgent;
using System.Net;
using System.Text;
int accepted=0,stopped=0;
using var bridge=new LocalRemoteBridge(g=>{accepted++;return true;},()=>stopped++);
using var client=new HttpClient(){BaseAddress=new Uri("http://127.0.0.1:17861"),Timeout=TimeSpan.FromSeconds(4)};
void Check(bool value,string message){if(!value)throw new Exception(message);}
async Task<HttpResponseMessage> Call(string path,HttpMethod method,string? body=null,string? origin="https://myworkstation-app.onrender.com"){
 var request=new HttpRequestMessage(method,path);if(origin!=null)request.Headers.Add("Origin",origin);request.Headers.Add("X-MWS-Local","remote-v2");if(body!=null)request.Content=new StringContent(body,Encoding.UTF8,"application/json");return await client.SendAsync(request);
}
using(var r=await Call("/status",HttpMethod.Get)){Check(r.StatusCode==HttpStatusCode.OK,"status");Check((await r.Content.ReadAsStringAsync()).Contains("\"version\":2"),"version");Check(r.Headers.GetValues("Access-Control-Allow-Origin").Single()=="https://myworkstation-app.onrender.com","exact CORS origin");}
using(var r=await Call("/status",HttpMethod.Get,origin:"https://evil.invalid"))Check(r.StatusCode==HttpStatusCode.Forbidden,"foreign browser");
using(var r=await Call("/status",HttpMethod.Get,origin:null))Check(r.StatusCode==HttpStatusCode.Forbidden,"missing origin");
using(var r=await Call("/accept",HttpMethod.Post,"{\"grant\":\"bad\"}"))Check(r.StatusCode==HttpStatusCode.BadRequest,"short grant");
using(var r=await Call("/accept",HttpMethod.Post,"{\"grant\":\""+new string('a',43)+"\"}"))Check(r.StatusCode==HttpStatusCode.OK,"explicit handoff");
Check(accepted==1,"not auto-accepted");
using(var r=await Call("/stop",HttpMethod.Post,"{}"))Check(r.StatusCode==HttpStatusCode.OK,"stop");
Check(stopped==1,"independent stop");
using(var r=await Call("/exec",HttpMethod.Post,"{}"))Check(r.StatusCode==HttpStatusCode.BadRequest,"no shell endpoint");
using(var r=await Call("/accept",HttpMethod.Post,new string('a',9000)))Check(r.StatusCode==HttpStatusCode.BadRequest,"bounded request body");
Console.WriteLine("Remote Agent actual loopback HTTP tests PASS; desktop/Windows consent remains NOT TESTED.");
