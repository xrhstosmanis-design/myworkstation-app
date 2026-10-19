package gr.myworkstation.chat;

/** Built-in text only. No storage, network action or user-specific content. */
final class QuickReplies {
    private static final String[] CHOICES = {
        "Το έλαβα, ευχαριστώ.", "Το ελέγχω και θα απαντήσω.", "Ολοκληρώθηκε.",
        "Χρειάζομαι περισσότερες πληροφορίες.", "Παρακαλώ στείλε μία φωτογραφία."
    };
    private QuickReplies() {}
    static String[] choices() { return CHOICES.clone(); }
    static String compose(String draft, String reply, boolean append) {
        boolean known = false;
        for (String choice : CHOICES) if (choice.equals(reply)) { known = true; break; }
        if (!known || draft == null) throw new IllegalArgumentException("Invalid reply");
        String result = append && !draft.isEmpty() ? draft + "\n" + reply : reply;
        if (result.length() > 5000) throw new IllegalArgumentException("Message too long");
        return result;
    }
}
