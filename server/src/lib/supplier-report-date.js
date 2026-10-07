// Report boundaries represent Greek business dates; formatting must not depend on the server TZ.
export function supplierReportDate(value) {
  return new Date(value).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" });
}
