package gr.myworkstation.chat;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores only the authenticated encrypted connection token; push SDK technical state is separate. */
final class TokenVault {
    private static final String ALIAS = "mws-chat-session-v1";
    private final File file;
    TokenVault(Context context) { file = new File(context.getNoBackupFilesDir(), "connection.enc"); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    void save(String token) throws Exception {
        clear();
        if (token == null || token.isEmpty() || token.length() > 16384) throw new IllegalArgumentException("Invalid session");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] plain = token.getBytes(StandardCharsets.UTF_8);
        try {
            byte[] encrypted = cipher.doFinal(plain), iv = cipher.getIV();
            byte[] record = new byte[1 + iv.length + encrypted.length]; record[0] = (byte) iv.length;
            System.arraycopy(iv, 0, record, 1, iv.length); System.arraycopy(encrypted, 0, record, 1 + iv.length, encrypted.length);
            Files.write(file.toPath(), record);
        } finally { Arrays.fill(plain, (byte) 0); }
    }
    String load() {
        if (!file.exists()) return "";
        byte[] plain = null;
        try {
            if (file.length() > 32768) throw new IllegalArgumentException("Invalid session");
            byte[] record = Files.readAllBytes(file.toPath());
            if (record.length < 30 || record[0] != 12) throw new IllegalArgumentException("Invalid session");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOfRange(record, 1, 13)));
            plain = cipher.doFinal(record, 13, record.length - 13);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception ignored) { clear(); return ""; }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); }
    }
    void clear() { if (file.exists() && !file.delete()) throw new IllegalStateException("Δεν διαγράφηκε η σύνδεση της συσκευής."); }
}
