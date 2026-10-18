package gr.myworkstation.chat;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;
public class PushEnvelopeTest {
    private final String binding = "a".repeat(64);
    private Map<String,String> data() { Map<String,String> m = new HashMap<>(); m.put("kind","MWS_CHAT"); m.put("binding",binding); m.put("storeId","A"); m.put("companyId","C"); return m; }
    @Test public void staffRequiresExactStoreAndCompany() {
        assertTrue(PushEnvelope.allowed(data(),binding,true,"A","C"));
        assertFalse(PushEnvelope.allowed(data(),binding,true,"B","C"));
        assertFalse(PushEnvelope.allowed(data(),binding,true,"A","D"));
    }
    @Test public void staleSessionAndContentAreRejected() {
        assertFalse(PushEnvelope.allowed(data(),"b".repeat(64),false,"",""));
        Map<String,String> m = data(); m.put("body","PRIVATE"); assertFalse(PushEnvelope.allowed(m,binding,false,"",""));
        m = data(); m.remove("kind"); m.put("body","PRIVATE"); assertFalse(PushEnvelope.allowed(m,binding,false,"",""));
    }
    @Test public void identifiersAreBoundedAndNoArbitraryUrlIsConsumed() {
        Map<String,String> m=data(); m.put("storeId",""); assertFalse(PushEnvelope.allowed(m,binding,false,"",""));
        m=data(); m.put("companyId","x".repeat(201)); assertFalse(PushEnvelope.allowed(m,binding,false,"",""));
        m=data(); m.put("url","https://evil.example"); assertFalse(PushEnvelope.allowed(m,binding,false,"",""));
        assertTrue(PushEnvelope.allowed(data(),binding,false,"",""));
    }
}
