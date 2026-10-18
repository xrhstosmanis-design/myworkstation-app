package gr.myworkstation.chat;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
public class EvidenceScopeTest {
    private JSONObject scope(String company, String store) throws Exception { return new JSONObject().put("companyId",company).put("storeId",store); }
    @Test public void refusesAnotherStoreEvenWhenOuterScopeMatches() throws Exception {
        JSONObject source = scope("company","other").put("scope","OWNER_SELECTED_STORE");
        JSONObject answer = new JSONObject().put("scope",scope("company","store")).put("evidence",new JSONArray().put(source));
        assertFalse(EvidenceScope.valid(answer,"company","store",false));
    }
    @Test public void refusesOtherCompanyAndAllStoreMode() throws Exception {
        JSONObject source = new JSONObject().put("kind","sales_by_store").put("scope","PLATFORM_ALL_STORES").put("stores",new JSONArray().put(scope("company","store")));
        JSONObject answer = new JSONObject().put("scope",scope("company","store")).put("evidence",new JSONArray().put(source));
        assertFalse(EvidenceScope.valid(answer,"company","store",true));
        source.put("scope","PLATFORM_SELECTED_STORE").put("stores",new JSONArray().put(scope("foreign","store")));
        assertFalse(EvidenceScope.valid(answer,"company","store",true));
    }
    @Test public void acceptsCurrentSelectedCanonicalEvidenceAndRejectsMalformedLists() throws Exception {
        JSONObject source = scope("company","store").put("scope","OWNER_SELECTED_STORE");
        JSONObject answer = new JSONObject().put("scope",scope("company","store")).put("evidence",new JSONArray().put(source));
        assertTrue(EvidenceScope.valid(answer,"company","store",false));
        answer.put("evidence","wrong"); assertFalse(EvidenceScope.valid(answer,"company","store",false));
        assertFalse(EvidenceScope.valid(answer,"","",false));
    }
}
