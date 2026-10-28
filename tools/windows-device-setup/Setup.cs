using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace MyWorkStationDeviceSetup {
  static class Program {
    [STAThread] static int Main(string[] args) {
      if(args.Contains("--self-test")) { try { SetupTests.Run();Console.WriteLine("Device setup isolated self-test PASS");return 0; } catch(Exception e) { Console.Error.WriteLine(e);return 1; } }
      Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new SetupForm());return 0;
    }
  }
  sealed class SetupForm:Form {
    readonly Button scanner=new Button(),printer=new Button();readonly Label status=new Label();readonly ProgressBar progress=new ProgressBar();bool working;
    public SetupForm() {
      Text="MyWorkStation · Εγκατάσταση συσκευών";StartPosition=FormStartPosition.CenterScreen;ClientSize=new Size(660,560);MinimumSize=new Size(600,430);AutoScroll=true;AutoScaleMode=AutoScaleMode.Dpi;Font=new Font("Segoe UI",11);BackColor=Color.FromArgb(245,250,248);
      var layout=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,AutoSizeMode=AutoSizeMode.GrowAndShrink,Padding=new Padding(24),ColumnCount=1,RowCount=7};layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
      var title=new Label{Text="Σαρωτής και εκτυπωτής καρτελακίων",AutoSize=true,Font=new Font("Segoe UI",17,FontStyle.Bold),ForeColor=Color.FromArgb(11,82,62)};
      var note=new Label{Text="Εγκατάσταση στον υπολογιστή που είναι συνδεδεμένη η συσκευή. Δεν χρειάζεται εξαγωγή ZIP ή εκτέλεση εντολών.",AutoSize=true,MaximumSize=new Size(600,0)};
      scanner.Text="Εγκατάσταση σαρωτή εγγράφων";printer.Text="Προσθήκη εκτυπωτή ετικετών / καρτελακίων";
      foreach(var b in new[]{scanner,printer}) { b.Dock=DockStyle.Fill;b.MinimumSize=new Size(0,54);b.Margin=new Padding(0,8,0,0); }
      scanner.Click+=Install;printer.Click+=delegate { try { PrinterSetup.Open(delegate(string uri){Process.Start(new ProcessStartInfo(uri){UseShellExecute=true});});status.Text="Στα Windows πάτησε Προσθήκη συσκευής. Μετά διάλεξε τον εκτυπωτή στο παράθυρο εκτύπωσης του MyWorkStation και τις σωστές διαστάσεις ετικέτας."; } catch { status.Text="Δεν άνοιξαν οι ρυθμίσεις. Άνοιξε Ρυθμίσεις Windows → Εκτυπωτές και σαρωτές."; } };
      var startup=new Label{Text="Ο σύνδεσμος σαρωτή εγκαθίσταται για τον τρέχοντα χρήστη και ανοίγει μαζί με τα Windows. Η ζεύξη γίνεται μία φορά μέσα στο MyWorkStation. Δεν ξεκινά σάρωση ή εκτύπωση από την εγκατάσταση.",AutoSize=true,MaximumSize=new Size(600,0),Margin=new Padding(0,12,0,8)};
      progress.Dock=DockStyle.Top;progress.Height=20;status.AutoSize=true;status.MaximumSize=new Size(600,0);status.Margin=new Padding(0,10,0,0);
      layout.Controls.Add(title);layout.Controls.Add(note);layout.Controls.Add(scanner);layout.Controls.Add(printer);layout.Controls.Add(startup);layout.Controls.Add(progress);layout.Controls.Add(status);Controls.Add(layout);
      FormClosing+=delegate(object sender,FormClosingEventArgs e){if(working){e.Cancel=true;status.Text="Η εγκατάσταση ολοκληρώνεται. Περίμενε λίγο πριν κλείσεις.";}};
    }
    void Install(object sender,EventArgs e) {
      if(working)return;
      var listener=new TcpListener(IPAddress.Loopback,17839);try{listener.Start();}catch{status.Text="Κλείσε το παλιό παράθυρο του συνδέσμου σαρωτή και πάτησε ξανά Εγκατάσταση.";return;}finally{listener.Stop();}
      working=true;scanner.Enabled=false;printer.Enabled=false;progress.Value=0;status.Text="Εγκατάσταση συνδέσμου σαρωτή…";
      var task=new BackgroundWorker{WorkerReportsProgress=true};task.ProgressChanged+=delegate(object s,ProgressChangedEventArgs p){progress.Value=Math.Max(0,Math.Min(100,p.ProgressPercentage));};
      task.DoWork+=delegate {
        string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MyWorkStation","DocumentScanner");
        string shortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"MyWorkStation Scanner.lnk");
        using(var package=Package.Embedded())package.Install(root,shortcut,CreateShortcut,delegate(string exe){var p=Process.Start(new ProcessStartInfo(exe){WorkingDirectory=Path.GetDirectoryName(exe),UseShellExecute=true});if(p==null)throw new IOException("Δεν ξεκίνησε ο σύνδεσμος.");},p=>task.ReportProgress(p));
      };
      task.RunWorkerCompleted+=delegate(object s,RunWorkerCompletedEventArgs result){working=false;scanner.Enabled=true;printer.Enabled=true;if(result.Error!=null){status.Text="Δεν ολοκληρώθηκε η εγκατάσταση. Οι προηγούμενες ρυθμίσεις διατηρήθηκαν. Κλείσε τυχόν παλιό σύνδεσμο και δοκίμασε ξανά.";progress.Value=0;}else{progress.Value=100;status.Text="Ο σύνδεσμος εγκαταστάθηκε και ζητήθηκε η εκκίνησή του. Στο MyWorkStation πάτησε Σάρωση εγγράφου και ολοκλήρωσε τη σύνδεση μία φορά, αν ζητηθεί κωδικός. Η λειτουργία της συσκευής ελέγχεται με πραγματική σάρωση.";}task.Dispose();};task.RunWorkerAsync();
    }
    internal static void CreateShortcut(string path,string exe) {
      object shell=null,link=null;try{shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic s=shell;link=s.CreateShortcut(path);dynamic l=link;l.TargetPath=exe;l.WorkingDirectory=Path.GetDirectoryName(exe);l.WindowStyle=7;l.Description="MyWorkStation Scanner";l.Save();}finally{if(link!=null&&Marshal.IsComObject(link))Marshal.FinalReleaseComObject(link);if(shell!=null&&Marshal.IsComObject(shell))Marshal.FinalReleaseComObject(shell);}
    }
  }
  static class PrinterSetup { public static void Open(Action<string> launch){launch("ms-settings:printers");} }
  sealed class FileSpec { public string Name,Hash;public long Size; }
  sealed class Package:IDisposable {
    const long MaxFile=64L*1024*1024,MaxTotal=256L*1024*1024,MaxZip=128L*1024*1024;
    readonly Stream bytes;readonly ZipArchive zip;readonly List<FileSpec> files=new List<FileSpec>();readonly string zipHash;
    public static Package Embedded() {
      var a=Assembly.GetExecutingAssembly();var stream=a.GetManifestResourceStream("ScannerPayload.zip");if(stream==null)throw new InvalidDataException("Missing payload.");
      try{using(var text=new StreamReader(a.GetManifestResourceStream("ScannerPayload.manifest"),Encoding.UTF8))return new Package(stream,text.ReadToEnd());}catch{stream.Dispose();throw;}
    }
    internal Package(Stream source,string manifest) {
      bytes=source;if(!source.CanSeek||source.Length>MaxZip)throw new InvalidDataException("Package size.");
      var lines=manifest.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries);if(lines.Length<2||lines[0].Split('\t').Length!=2||!lines[0].StartsWith("zip\t"))throw new InvalidDataException("Package manifest.");
      zipHash=lines[0].Substring(4);if(!Regex.IsMatch(zipHash,"^[a-f0-9]{64}$")||Hash(source)!=zipHash)throw new InvalidDataException("Package checksum.");source.Position=0;
      var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
      foreach(var line in lines.Skip(1)){var v=line.Split('\t');long size;if(v.Length!=3||!Regex.IsMatch(v[0],"^[a-f0-9]{64}$")||!long.TryParse(v[1],NumberStyles.None,CultureInfo.InvariantCulture,out size)||size<0||size>MaxFile)throw new InvalidDataException("File manifest.");var name=SafeName(v[2]);if(!names.Add(name))throw new InvalidDataException("Duplicate file.");total=checked(total+size);files.Add(new FileSpec{Name=name,Hash=v[0],Size=size});}
      if(files.Count>500||total>MaxTotal||!names.Contains("MyWorkStation.DocumentScanner.exe"))throw new InvalidDataException("Package limits.");
      zip=new ZipArchive(source,ZipArchiveMode.Read,true);if(zip.Entries.Count>1000)throw new InvalidDataException("Entry count.");var found=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      foreach(var entry in zip.Entries){var name=SafeName(entry.FullName.TrimEnd('/','\\'));if(((entry.ExternalAttributes>>16)&0xF000)==0xA000)throw new InvalidDataException("Links are forbidden.");if(entry.FullName.EndsWith("/")||entry.FullName.EndsWith("\\")){if(entry.Length!=0)throw new InvalidDataException("Directory data.");continue;}var spec=files.FirstOrDefault(f=>String.Equals(f.Name,name,StringComparison.OrdinalIgnoreCase));if(spec==null||entry.Length!=spec.Size||!found.Add(name))throw new InvalidDataException("Unexpected entry.");}
      if(found.Count!=files.Count)throw new InvalidDataException("Missing file.");
    }
    static string SafeName(string raw) {
      var name=raw.Replace('\\','/');if(!Regex.IsMatch(name,"^[A-Za-z0-9_./-]+$")||name.StartsWith("/"))throw new InvalidDataException("Unsafe name.");
      foreach(var part in name.Split('/'))if(part.Length==0||part=="."||part==".."||part.EndsWith(".")||Regex.IsMatch(part,"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)",RegexOptions.IgnoreCase)||part.Equals("pair.bin",StringComparison.OrdinalIgnoreCase)||part.Equals("pair.bin.new",StringComparison.OrdinalIgnoreCase)||part.Equals(".env",StringComparison.OrdinalIgnoreCase)||Regex.IsMatch(part,@"\.(pfx|pem|key)$",RegexOptions.IgnoreCase))throw new InvalidDataException("Reserved name.");return name;
    }
    internal static string Hash(Stream s){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
    static void OrdinaryDirectory(string path){if(Directory.Exists(path)&&(File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked directory.");}
    void Verify(string directory) {
      OrdinaryDirectory(directory);var collected=new List<string>();var pending=new Stack<string>();pending.Push(directory);int visited=0;while(pending.Count>0){var current=pending.Pop();if(++visited>1000)throw new InvalidDataException("Directory limit.");OrdinaryDirectory(current);collected.AddRange(Directory.GetFiles(current));if(collected.Count>500)throw new InvalidDataException("File count.");foreach(var child in Directory.GetDirectories(current)){OrdinaryDirectory(child);pending.Push(child);}}var actual=collected.ToArray();if(actual.Length!=files.Count)throw new InvalidDataException("Unexpected installed files.");
      foreach(var spec in files){string p=Path.Combine(directory,spec.Name.Replace('/',Path.DirectorySeparatorChar));if(!File.Exists(p)||(File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0||new FileInfo(p).Length!=spec.Size)throw new InvalidDataException("Installed file mismatch.");using(var s=File.OpenRead(p))if(Hash(s)!=spec.Hash)throw new InvalidDataException("Installed checksum.");}
    }
    internal void Install(string root,string shortcut,Action<string,string> makeShortcut,Action<string> launch,Action<int> report) {
      OrdinaryDirectory(root);var versions=Path.Combine(root,"versions");OrdinaryDirectory(versions);Directory.CreateDirectory(versions);string target=Path.Combine(versions,"v-"+zipHash.Substring(0,16)),stage=Path.Combine(versions,"stage-"+Guid.NewGuid().ToString("N"));
      bool created=false,shortcutChanged=false;byte[] previous=null;if(File.Exists(shortcut)){if(new FileInfo(shortcut).Length>65536||(File.GetAttributes(shortcut)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Shortcut size/type.");previous=File.ReadAllBytes(shortcut);}
      string temporary=Path.Combine(Path.GetDirectoryName(shortcut),"MyWorkStation-"+Guid.NewGuid().ToString("N")+".lnk");
      try {
        if(!Directory.Exists(target)){Directory.CreateDirectory(stage);int count=0;foreach(var entry in zip.Entries){if(entry.FullName.EndsWith("/")||entry.FullName.EndsWith("\\"))continue;string relative=SafeName(entry.FullName),p=Path.Combine(stage,relative.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(p));using(var input=entry.Open())using(var output=new FileStream(p,FileMode.CreateNew,FileAccess.Write)){byte[] buffer=new byte[81920];long length=0;int read;while((read=input.Read(buffer,0,buffer.Length))>0){length+=read;if(length>entry.Length||length>MaxFile)throw new InvalidDataException("Expanded file limit.");output.Write(buffer,0,read);}if(length!=entry.Length)throw new InvalidDataException("Truncated file.");}report(++count*90/files.Count);}Verify(stage);Directory.Move(stage,target);created=true;}else Verify(target);
        string exe=Path.Combine(target,"MyWorkStation.DocumentScanner.exe");Directory.CreateDirectory(Path.GetDirectoryName(shortcut));makeShortcut(temporary,exe);if(!File.Exists(temporary))throw new IOException("Shortcut missing.");if(File.Exists(shortcut))File.Replace(temporary,shortcut,null);else File.Move(temporary,shortcut);shortcutChanged=true;launch(exe);report(100);
      }catch{
        if(shortcutChanged){if(previous==null){if(File.Exists(shortcut))File.Delete(shortcut);}else File.WriteAllBytes(shortcut,previous);}
        if(created&&Directory.Exists(target))Directory.Delete(target,true);throw;
      }finally{if(Directory.Exists(stage))Directory.Delete(stage,true);if(File.Exists(temporary))File.Delete(temporary);}
    }
    public void Dispose(){zip.Dispose();bytes.Dispose();}
  }
  static class SetupTests {
    static void Check(bool value){if(!value)throw new InvalidOperationException("Setup assertion failed.");}
    static Package Fixture(string name,byte[] value,string overrideHash=null,long overrideSize=-1) {
      var stream=new MemoryStream();using(var z=new ZipArchive(stream,ZipArchiveMode.Create,true)){using(var s=z.CreateEntry(name).Open())s.Write(value,0,value.Length);}stream.Position=0;string hash=Package.Hash(stream);stream.Position=0;string fileHash;using(var s=new MemoryStream(value))fileHash=Package.Hash(s);return new Package(stream,"zip\t"+hash+"\n"+(overrideHash??fileHash)+"\t"+(overrideSize<0?value.Length:overrideSize)+"\t"+name+"\n");
    }
    public static void Run() {
      string temp=Path.Combine(Path.GetTempPath(),"mws-device-setup-"+Guid.NewGuid().ToString("N")),root=Path.Combine(temp,"app"),shortcut=Path.Combine(temp,"fake-startup","scanner.lnk");Directory.CreateDirectory(root);File.WriteAllText(Path.Combine(root,"pair.bin"),"retain-existing-pairing");Directory.CreateDirectory(Path.GetDirectoryName(shortcut));File.WriteAllText(shortcut,"old-shortcut");int launched=0;
      Action<string,string> writer=SetupForm.CreateShortcut;
      try {
        using(var p=Package.Embedded()){p.Install(root,shortcut,writer,e=>{Check(File.Exists(e));launched++;},n=>{});p.Install(root,shortcut,writer,e=>launched++,n=>{});}Check(launched==2);Check(File.ReadAllText(Path.Combine(root,"pair.bin"))=="retain-existing-pairing");byte[] before=File.ReadAllBytes(shortcut);int folders=Directory.GetDirectories(Path.Combine(root,"versions")).Length;
        using(var p=Fixture("MyWorkStation.DocumentScanner.exe",Encoding.ASCII.GetBytes("isolated-new-version"))){bool failed=false;try{p.Install(root,shortcut,writer,e=>{throw new IOException("Simulated start refusal");},n=>{});}catch(IOException){failed=true;}Check(failed);}Check(File.ReadAllBytes(shortcut).SequenceEqual(before));Check(Directory.GetDirectories(Path.Combine(root,"versions")).Length==folders);Check(File.ReadAllText(Path.Combine(root,"pair.bin"))=="retain-existing-pairing");
        foreach(var name in new[]{"../escape.exe","/root.exe","C:/escape.exe","pair.bin","NUL.txt","a//b.exe","a/../b.exe"}){bool refused=false;try{using(var p=Fixture(name,new byte[]{1})){} }catch(InvalidDataException){refused=true;}Check(refused);}
        bool mismatch=false;try{using(var p=new Package(new MemoryStream(new byte[]{1,2,3}),"zip\t"+new string('0',64)+"\n"+new string('0',64)+"\t1\tMyWorkStation.DocumentScanner.exe")){} }catch(InvalidDataException){mismatch=true;}Check(mismatch);
        foreach(bool corrupt in new[]{false,true}){bool refused=false;try{using(var p=Fixture("MyWorkStation.DocumentScanner.exe",new byte[]{1},corrupt?new string('0',64):null,corrupt?-1:64L*1024*1024+1))p.Install(root,shortcut,writer,e=>{throw new InvalidOperationException("Must not launch invalid package");},n=>{});}catch(InvalidDataException){refused=true;}Check(refused);Check(File.ReadAllBytes(shortcut).SequenceEqual(before));Check(Directory.GetDirectories(Path.Combine(root,"versions")).Length==folders);}
        using(var form=new SetupForm()){form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-10000,-10000);form.MinimumSize=Size.Empty;form.ClientSize=new Size(620,300);form.Show();var layout=(TableLayoutPanel)form.Controls[0];layout.Controls.OfType<Label>().Last().Text=new string('A',240);layout.PerformLayout();Application.DoEvents();Check(form.AutoScroll&&layout.AutoSize);foreach(var button in layout.Controls.OfType<Button>())Check(button.Height>=48&&button.Left>=0&&button.Right<=layout.ClientSize.Width);Check(form.VerticalScroll.Visible);form.Close();}
        string uri=null;PrinterSetup.Open(s=>uri=s);Check(uri=="ms-settings:printers");
      }finally{if(Directory.Exists(temp))Directory.Delete(temp,true);}
    }
  }
}
