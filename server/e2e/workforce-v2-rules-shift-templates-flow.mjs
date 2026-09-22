  assert.ok(audits>=10,`expected at least 10 Workforce audit rows, got ${audits}`);

  const missingApply=await request(`${base}/migration/apply`,{method:"POST",token,body:{previewHash:"not-used"}});
  assert.equal(missingApply.response.status,403,"migration apply must remain forbidden for Owner users");

  console.log("E2E Workforce v2 rules and shift templates flow passed",{roleId,employeeA,employeeB,templateId,ruleId,audits});
