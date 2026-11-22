using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
namespace MyWorkStation.RemoteAgent;
internal sealed partial class AgentForm {
 const int ChunkBytes=256*1024,MaxFileBytes=25*1024*1024;
 readonly Button sendFile=new(){Text="Αποστολή αρχείου στον υπεύθυνο",AutoSize=true,Enabled=false};
 readonly FlowLayoutPanel incoming=new(){AutoSize=true,FlowDirection=FlowDirection.TopDown,WrapContents=false};
 readonly HashSet<string> handledFiles=new();
 int supportGeneration;LocalRemoteBridge? bridgeServer;bool invitedMode,fileBusy,bridgePending;string? activeBase;
 void ConfigureAttended(FlowLayoutPanel panel){
  panel.Controls.Add(new Label(){Text="Πρόσκληση από το POS: ο χειριστής πατά Αποδοχή στο MyWorkStation.\nΗ ενεργή πρόσβαση δεν έχει χρονικό όριο και σταματά με ΔΙΑΚΟΠΗ.",AutoSize=true,MaximumSize=new Size(560,0)});
  panel.Controls.Add(sendFile);panel.Controls.Add(incoming);sendFile.Click+=async(_,_)=>await UploadFile();
  var startup=new CheckBox(){Text="Άνοιγμα μαζί με τα Windows — αναμονή υποστήριξης",AutoSize=true};
  const string runKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
  try{using var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(runKey);startup.Checked=key?.GetValue("MyWorkStationRemoteAgent") is string;}catch{}
  startup.CheckedChanged+=(_,_)=>{try{using var key=Microsoft.Win32.Registry.CurrentUser.CreateSubKey(runKey);if(startup.Checked)key.SetValue("MyWorkStationRemoteAgent","\""+Application.ExecutablePath+"\" --ready");else key.DeleteValue("MyWorkStationRemoteAgent",false);}catch{status.Text="Δεν αποθηκεύτηκε η εκκίνηση μαζί με τα Windows.";}};panel.Controls.Add(startup);
  if(Environment.GetCommandLineArgs().Contains("--ready"))Shown+=(_,_)=>{TopMost=false;WindowState=FormWindowState.Minimized;};
  try{bridgeServer=new LocalRemoteBridge(grant=>{
   bool accepted=false;Invoke(new Action(()=>{if(session!=null||bridgePending)return;bridgePending=true;accepted=true;BeginInvoke(new Action(async()=>{try{await StartRemote(grant);}finally{bridgePending=false;}}));}));return accepted;
  },()=>BeginInvoke(new Action(Stop)));}catch{status.Text="Το Remote Agent δεν μπορεί να ανοίξει στο POS. Έλεγξε αν είναι ήδη ανοικτό άλλο αντίγραφο.";}
 }
 async Task<JsonElement> RemoteJson(string path,object? body,CancellationToken ct,int generation){
  if(generation!=supportGeneration||token==null||activeBase==null)throw new OperationCanceledException();
  using var request=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,activeBase+path);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);if(body!=null)request.Content=JsonContent.Create(body);
  using var response=await http.SendAsync(request,ct);response.EnsureSuccessStatusCode();var result=await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken:ct);if(generation!=supportGeneration)throw new OperationCanceledException();return result;
 }
 async Task FinishFile(string id,int generation){try{await RemoteJson($"/files/{Uri.EscapeDataString(id)}/finish",new{},CancellationToken.None,generation);}catch{}}
 async Task UploadFile(){
  if(fileBusy||!invitedMode||session==null)return;var ct=session.Token;int generation=supportGeneration;
  using var picker=new OpenFileDialog(){Title="Επίλεξε αρχείο για τον υπεύθυνο υποστήριξης",Multiselect=false,CheckFileExists=true};if(picker.ShowDialog(this)!=DialogResult.OK||ct.IsCancellationRequested)return;
  fileBusy=true;sendFile.Enabled=false;string? id=null;
  try{using var file=new FileStream(picker.FileName,FileMode.Open,FileAccess.Read,FileShare.Read);if(file.Length<1||file.Length>MaxFileBytes)throw new InvalidOperationException("Επίλεξε αρχείο έως 25 MB.");var sha=Convert.ToHexString(await SHA256.HashDataAsync(file,ct)).ToLowerInvariant();file.Position=0;var entry=await RemoteJson("/files",new{name=Path.GetFileName(picker.FileName),size=file.Length,sha256=sha},ct,generation);id=entry.GetProperty("id").GetString()!;var buffer=new byte[ChunkBytes];long offset=0;int n;while((n=await file.ReadAsync(buffer,ct))>0){await RemoteJson($"/files/{id}/chunk",new{offset,data=Convert.ToBase64String(buffer,0,n)},ct,generation);offset+=n;}status.Text="Το αρχείο στάλθηκε στον υπεύθυνο.";
  }catch(OperationCanceledException){if(id!=null)await FinishFile(id,generation);}catch(Exception e){if(id!=null)await FinishFile(id,generation);status.Text="Η μεταφορά δεν ολοκληρώθηκε: "+e.Message;}finally{if(generation==supportGeneration){fileBusy=false;sendFile.Enabled=invitedMode&&session!=null&&!ct.IsCancellationRequested;}}
 }
 void UpdateIncoming(JsonElement entries,CancellationToken ct){
  foreach(var f in entries.EnumerateArray()){
   if(f.GetProperty("direction").GetString()!="TO_DEVICE"||f.GetProperty("state").GetString()!="READY")continue;
   string id=f.GetProperty("id").GetString()!;if(!handledFiles.Add(id))continue;var entry=f.Clone();var button=new Button(){Text="Λήψη αρχείου: "+f.GetProperty("name").GetString(),AutoSize=true,MaximumSize=new Size(550,0)};
   button.Click+=async(_,_)=>{if(fileBusy)return;button.Enabled=false;await ReceiveFile(entry,ct);incoming.Controls.Remove(button);button.Dispose();};incoming.Controls.Add(button);
  }
 }
 async Task ReceiveFile(JsonElement f,CancellationToken ct){
  if(ct.IsCancellationRequested)return;int generation=supportGeneration;
  string id=f.GetProperty("id").GetString()!,name=f.GetProperty("name").GetString()!;long size=f.GetProperty("size").GetInt64();string sha=f.GetProperty("sha256").GetString()!;
  if(name!=Path.GetFileName(name)||name.IndexOfAny(Path.GetInvalidFileNameChars())>=0||size<1||size>MaxFileBytes){await FinishFile(id,generation);return;}
  using var picker=new SaveFileDialog(){Title="Αποθήκευση αρχείου υποστήριξης — δεν εκτελείται αυτόματα",FileName=name,OverwritePrompt=true,AddExtension=false};
  if(picker.ShowDialog(this)!=DialogResult.OK||ct.IsCancellationRequested){await FinishFile(id,generation);return;}
  fileBusy=true;sendFile.Enabled=false;string temp=picker.FileName+".mws-"+Guid.NewGuid().ToString("N")+".partial";
  try{
   using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256)){
    for(long offset=0;offset<size;offset+=ChunkBytes){ct.ThrowIfCancellationRequested();var part=await RemoteJson($"/files/{id}/chunk?offset={offset}",null,ct,generation);if(part.GetProperty("id").GetString()!=id||part.GetProperty("offset").GetInt64()!=offset||part.GetProperty("size").GetInt64()!=size||part.GetProperty("sha256").GetString()!=sha)throw new InvalidOperationException("Λάθος μεταφορά.");var bytes=Convert.FromBase64String(part.GetProperty("data").GetString()!);if(bytes.Length!=Math.Min(ChunkBytes,size-offset))throw new InvalidOperationException("Ελλιπές αρχείο.");hash.AppendData(bytes);await output.WriteAsync(bytes,ct);}
    if(Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant()!=sha)throw new InvalidOperationException("Το αρχείο αλλοιώθηκε.");
   }
   ct.ThrowIfCancellationRequested();File.Move(temp,picker.FileName,true);await FinishFile(id,generation);status.Text="Το αρχείο αποθηκεύτηκε. Δεν εκτελέστηκε.";
  }catch(OperationCanceledException){await FinishFile(id,generation);}catch(Exception e){await FinishFile(id,generation);status.Text="Η λήψη δεν ολοκληρώθηκε: "+e.Message;}finally{try{File.Delete(temp);}catch{}if(generation==supportGeneration){fileBusy=false;sendFile.Enabled=invitedMode&&session!=null&&!ct.IsCancellationRequested;}}
 }
}
