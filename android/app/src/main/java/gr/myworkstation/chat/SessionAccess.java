package gr.myworkstation.chat;

import org.json.JSONObject;

/** Mirror server-issued role claims for routing only; the server still authorizes every request. */
final class SessionAccess {
    static boolean platform(JSONObject identity) {
        return "SUPER_ADMIN".equals(identity.optString("role"))
            || "SUPER_ADMIN".equals(identity.optString("platformRole"))
            || Boolean.TRUE.equals(identity.opt("isSuperAdmin"));
    }
    static boolean switchOwnerCompany(JSONObject identity, String targetCompany) {
        return "BACKOFFICE_USER".equals(identity.optString("tokenType"))
            && "OWNER".equals(identity.optString("role")) && !platform(identity)
            && !identity.optBoolean("supportContext")
            && !targetCompany.isEmpty() && !targetCompany.equals(identity.optString("companyId"));
    }
}
