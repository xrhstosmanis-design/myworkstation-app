using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace MyWorkStationSetup {
  internal static class Program {
    [STAThread]
    private static void Main() {
      Application.EnableVisualStyles();
      Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new SetupForm());
    }
  }

  internal sealed class SetupForm : Form {
    private readonly TextBox link = new TextBox();
    private readonly Label status = new Label();
    private readonly Button install = new Button();

    internal SetupForm() {
      Text = "MyWorkStation Setup";
      StartPosition = FormStartPosition.CenterScreen;
      ClientSize = new Size(650, 310);
      MinimumSize = new Size(650, 310);
      BackColor = Color.FromArgb(245, 248, 252);
      Font = new Font("Segoe UI", 10F);

      var title = new Label {
        Text = "Εγκατάσταση MyWorkStation Store Mode",
        Font = new Font("Segoe UI Semibold", 18F),
        ForeColor = Color.FromArgb(13, 42, 73),
        AutoSize = true,
        Location = new Point(28, 24)
      };
      var note = new Label {
        Text = "Επικόλλησε το εφάπαξ link από Super Admin → Εγκαταστάσεις / Τερματικά.",
        AutoSize = true,
        Location = new Point(31, 72)
      };
      link.Location = new Point(34, 105);
      link.Size = new Size(580, 30);
      link.UseSystemPasswordChar = true;

      install.Text = "Εγκατάσταση";
      install.Location = new Point(34, 151);
      install.Size = new Size(180, 42);
      install.BackColor = Color.FromArgb(20, 105, 180);
      install.ForeColor = Color.White;
      install.FlatStyle = FlatStyle.Flat;
      install.Click += Install;

      status.Location = new Point(34, 210);
      status.Size = new Size(580, 65);
      status.ForeColor = Color.FromArgb(90, 35, 35);

      Controls.Add(title);
      Controls.Add(note);
      Controls.Add(link);
      Controls.Add(install);
      Controls.Add(status);
    }

    private void Install(object sender, EventArgs args) {
      install.Enabled = false;
      status.Text = "Έλεγχος link…";
      try {
        Uri uri;
        if (!Uri.TryCreate(link.Text.Trim(), UriKind.Absolute, out uri)) throw new InvalidOperationException("Το link δεν είναι έγκυρο.");
        if (uri.Scheme != Uri.UriSchemeHttps || !String.Equals(uri.Host, "myworkstation-app.onrender.com", StringComparison.OrdinalIgnoreCase))
          throw new InvalidOperationException("Το link πρέπει να προέρχεται από το επίσημο MyWorkStation production.");
        if (!Regex.IsMatch(uri.AbsolutePath, @"^/store/[^/]+/?$", RegexOptions.IgnoreCase) ||
            !Regex.IsMatch(uri.Query, @"^\?terminal=[A-Za-z0-9_-]{2,40}&activation=[A-Za-z0-9_-]{32,200}$"))
          throw new InvalidOperationException("Χρειάζεται νέο εφάπαξ installation link από το Super Admin.");

        var canonical = uri.GetLeftPart(UriPartial.Authority) + uri.AbsolutePath;
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var shortcut = Path.Combine(desktop, "MyWorkStation - Κυλικείο ΚΑΤ.url");
        File.WriteAllLines(shortcut, new [] {
          "[InternetShortcut]",
          "URL=" + canonical,
          "IconFile=%SystemRoot%\\System32\\SHELL32.dll",
          "IconIndex=14"
        });
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        link.Clear();
        status.ForeColor = Color.FromArgb(20, 105, 65);
        status.Text = "Η εγκατάσταση ολοκληρώθηκε. Δημιουργήθηκε συντόμευση και άνοιξε η ασφαλής ενεργοποίηση στον browser.";
        install.Text = "Ολοκληρώθηκε";
      } catch (Exception ex) {
        status.ForeColor = Color.FromArgb(150, 35, 35);
        status.Text = ex.Message + " Δεν έγινε καμία αλλαγή.";
        install.Enabled = true;
      }
    }
  }
}
