package gr.myworkstation.chat;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class SessionAccessTest {
    private JSONObject owner() throws Exception { return new JSONObject("{\"role\":\"OWNER\",\"platformRole\":\"OWNER\",\"isSuperAdmin\":false,\"tokenType\":\"BACKOFFICE_USER\",\"companyId\":\"A\"}"); }
    @Test public void canonicalSuperAdminCompatibilityOwnerNeverUsesOwnerSwitch() throws Exception {
        JSONObject identity = owner().put("platformRole", "SUPER_ADMIN").put("isSuperAdmin", true);
        assertTrue(SessionAccess.platform(identity));
        assertFalse(SessionAccess.switchOwnerCompany(identity, "B"));
        identity.remove("platformRole"); assertTrue(SessionAccess.platform(identity));
        identity.remove("isSuperAdmin"); identity.put("role", "SUPER_ADMIN"); assertTrue(SessionAccess.platform(identity));
    }
    @Test public void ordinaryOwnerStillSelectsOnlyWhenCompanyChanges() throws Exception {
        JSONObject identity = owner(); assertFalse(SessionAccess.platform(identity));
        assertTrue(SessionAccess.switchOwnerCompany(identity, "B"));
        assertFalse(SessionAccess.switchOwnerCompany(identity, "A"));
        assertFalse(SessionAccess.switchOwnerCompany(identity, ""));
    }
    @Test public void supportAndChatStaffCannotUseOwnerCompanySwitch() throws Exception {
        assertFalse(SessionAccess.switchOwnerCompany(owner().put("supportContext", true), "B"));
        assertFalse(SessionAccess.switchOwnerCompany(owner().put("tokenType", "STORE_CHAT_OPERATOR"), "B"));
        assertFalse(SessionAccess.switchOwnerCompany(owner().put("role", "MANAGER"), "B"));
        assertFalse(SessionAccess.platform(owner().put("isSuperAdmin", "true")));
    }
}
