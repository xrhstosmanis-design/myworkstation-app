using System.Drawing.Imaging;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace MyWorkStation.RemoteAgent;
internal static class Program {
 [STAThread] static void Main(){ApplicationConfiguration.Initialize();Application.Run(new AgentForm());}
}
internal sealed class AgentForm:Form {
 const string Origin="https://myworkstation-app.onrender.com";
 readonly TextBox code=new(){Width=120,MaxLength=6,UseSystemPasswordChar=true};
 readonly CheckBox consent=new(){Text="Επιτρέπω προβολή οθόνης και ποντίκι/πληκτρολόγιο τώρα.",AutoSize=true};
 readonly Label status=new(){Text="Δεν υπάρχει ενεργή σύνδεση.",AutoSize=true};
 readonly Button connect=new(){Text="Αποδοχή και σύνδεση",AutoSize=true},stop=new(){Text="ΔΙΑΚΟΠΗ ΠΡΟΣΒΑΣΗΣ",AutoSize=true,Enabled=false,BackColor=Color.LightCoral};
 readonly HttpClient http=new(){BaseAddress=new Uri(Origin),Timeout=TimeSpan.FromSeconds(5)};
 CancellationTokenSource? session;string? token,sessionJob;
 public AgentForm(){
  Text="MyWorkStation · Remote Assist";Width=620;Height=320;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;TopMost=true;
  var panel=new FlowLayoutPanel(){Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(16)};
  panel.Controls.Add(new Label(){Text="Πρόσβαση μόνο με δική σας αποδοχή. Κρατήστε το παράθυρο ανοικτό.\nΟ διαχειριστής μπορεί να δει όλη την κύρια οθόνη και να την χειριστεί.",AutoSize=true});
  panel.Controls.Add(new Label(){Text="Εξαψήφιος κωδικός από τον διαχειριστή",AutoSize=true});panel.Controls.Add(code);
  panel.Controls.Add(consent);panel.Controls.Add(connect);panel.Controls.Add(stop);panel.Controls.Add(status);Controls.Add(panel);
  connect.Click+=async(_,_)=>await Start();stop.Click+=(_,_)=>Stop();consent.CheckedChanged+=(_,_)=>{if(!consent.Checked)Stop();};FormClosing+=(_,_)=>Stop();
 }
 void Stop(){session?.Cancel();status.Text="Η πρόσβαση διακόπηκε.";stop.Enabled=false;}
 async Task Start(){
  if(session!=null||!consent.Checked){status.Text="Απαιτείται τοπική αποδοχή.";return;}
  if(code.Text.Length!=6||code.Text.Any(c=>c<'0'||c>'9')){status.Text="Συμπληρώστε μόνο τον εξαψήφιο κωδικό.";return;}
  connect.Enabled=false;code.Enabled=false;session=new CancellationTokenSource();var ct=session.Token;
  try{
   var paired=await http.PostAsJsonAsync("/api/remote-agent/pair-code",new{code=code.Text,localConsent=true},ct);
   paired.EnsureSuccessStatusCode();var pair=await paired.Content.ReadFromJsonAsync<JsonElement>(cancellationToken:ct);
   token=pair.GetProperty("token").GetString();sessionJob=pair.GetProperty("jobId").GetString()??throw new InvalidOperationException("Λείπει η συνεδρία.");code.Clear();stop.Enabled=true;status.Text="ΕΝΕΡΓΗ ΠΡΟΣΒΑΣΗ · Πατήστε ΔΙΑΚΟΠΗ οποιαδήποτε στιγμή.";
   var expiresAt=pair.GetProperty("expiresAt").GetInt64();
   while(!ct.IsCancellationRequested&&DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()<expiresAt){
    var bounds=Screen.PrimaryScreen?.Bounds??throw new InvalidOperationException("Δεν υπάρχει οθόνη.");
    using var capture=new Bitmap(bounds.Width,bounds.Height);using(var graphics=Graphics.FromImage(capture))graphics.CopyFromScreen(bounds.Location,Point.Empty,bounds.Size);
    int width=Math.Min(1600,bounds.Width),height=(int)Math.Round(bounds.Height*(double)width/bounds.Width);
    using var resized=new Bitmap(capture,new Size(width,height));using var stream=new MemoryStream();
    var codec=ImageCodecInfo.GetImageEncoders().First(c=>c.MimeType=="image/jpeg");using var parameters=new EncoderParameters(1);parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,45L);resized.Save(stream,codec,parameters);
    using var request=new HttpRequestMessage(HttpMethod.Post,$"/api/remote-agent/{Uri.EscapeDataString(sessionJob)}/frame"){Content=JsonContent.Create(new{jpeg=Convert.ToBase64String(stream.ToArray()),width=bounds.Width,height=bounds.Height})};request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
    using var response=await http.SendAsync(request,ct);response.EnsureSuccessStatusCode();var result=await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken:ct);
    foreach(var command in result.GetProperty("commands").EnumerateArray()){
     if(ct.IsCancellationRequested||!consent.Checked)break;
     // Never apply delayed input after an interruption or against an old screen.
     if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-command.GetProperty("at").GetInt64()>3000)continue;
     NativeInput.Apply(command,bounds);
    }
    await Task.Delay(700,ct);
   }
  }catch(OperationCanceledException){}catch(Exception){status.Text="Η σύνδεση σταμάτησε. Ελέγξτε τον κωδικό/διαθεσιμότητα με τον διαχειριστή.";}
  finally{
   if(token!=null&&sessionJob!=null)try{using var request=new HttpRequestMessage(HttpMethod.Post,$"/api/remote-agent/{Uri.EscapeDataString(sessionJob)}/device-stop");request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);using var response=await http.SendAsync(request);}catch{}
   token=null;sessionJob=null;session?.Dispose();session=null;stop.Enabled=false;connect.Enabled=true;code.Enabled=true;consent.Checked=false;http.DefaultRequestHeaders.Authorization=null;
  }
 }
 protected override void Dispose(bool disposing){if(disposing){session?.Cancel();http.Dispose();}base.Dispose(disposing);}
}
internal static class NativeInput {
 [StructLayout(LayoutKind.Sequential)] struct INPUT{public uint type;public UNION u;}
 [StructLayout(LayoutKind.Explicit)] struct UNION{[FieldOffset(0)]public MOUSEINPUT mouse;[FieldOffset(0)]public KEYBDINPUT key;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT{public int dx,dy;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT{public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 static void Send(params INPUT[] inputs){if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf<INPUT>())!=inputs.Length)throw new InvalidOperationException("Τα Windows δεν επέτρεψαν την εντολή.");}
 static INPUT Mouse(uint flags,uint data=0)=>new(){type=0,u=new UNION{mouse=new MOUSEINPUT{flags=flags,data=data}}};
 static INPUT Key(ushort vk,uint flags=0,ushort scan=0)=>new(){type=1,u=new UNION{key=new KEYBDINPUT{vk=vk,flags=flags,scan=scan}}};
 public static void Apply(JsonElement command,Rectangle bounds){
  switch(command.GetProperty("type").GetString()){
   case "click":var x=command.GetProperty("x").GetDouble();var y=command.GetProperty("y").GetDouble();if(x<0||x>1||y<0||y>1)return;SetCursorPos(bounds.Left+Math.Min(bounds.Width-1,(int)(x*bounds.Width)),bounds.Top+Math.Min(bounds.Height-1,(int)(y*bounds.Height)));bool right=command.GetProperty("button").GetString()=="right";Send(Mouse(right?0x0008u:0x0002u),Mouse(right?0x0010u:0x0004u));break;
   case "wheel":Send(Mouse(0x0800,unchecked((uint)(command.GetProperty("direction").GetInt32()*120))));break;
   case "key":var keys=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Backspace",8},{"Delete",46},{"Escape",27},{"ArrowLeft",37},{"ArrowUp",38},{"ArrowRight",39},{"ArrowDown",40},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34}};if(keys.TryGetValue(command.GetProperty("key").GetString()??"",out var key))Send(Key(key),Key(key,2));break;
   case "text":var text=command.GetProperty("text").GetString()??"";if(text.Length>200||text.Any(char.IsControl))return;foreach(char c in text)Send(Key(0,4,c),Key(0,6,c));break;
  }
 }
}
