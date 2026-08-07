import test from "node:test";
import assert from "node:assert/strict";
import { getMailConfig,getMailStatus } from "../src/services/mail.js";

test("mail configuration uses secure SMTP defaults",()=>{
  const config=getMailConfig({
    SMTP_HOST:"smtp-gr.securemail.pro",
    SMTP_USER:"support@myworkstation.gr",
    SMTP_PASSWORD:"secret",
    MAIL_FROM:"support@myworkstation.gr",
    MAIL_TEST_RECIPIENT:"owner@example.com"
  });
  assert.equal(config.port,465);
  assert.equal(config.secure,true);
  assert.equal(config.password,"secret");
});

test("mail status reports missing secrets without exposing a password",()=>{
  const status=getMailStatus({SMTP_HOST:"smtp-gr.securemail.pro"});
  assert.equal(status.configured,false);
  assert.deepEqual(status.missing,["SMTP_USER","SMTP_PASSWORD","MAIL_FROM","MAIL_TEST_RECIPIENT"]);
  assert.equal(Object.hasOwn(status,"password"),false);
});

test("mail status becomes ready only with all required values",()=>{
  const status=getMailStatus({
    SMTP_HOST:"smtp-gr.securemail.pro",
    SMTP_PORT:"465",
    SMTP_SECURE:"true",
    SMTP_USER:"support@myworkstation.gr",
    SMTP_PASSWORD:"secret",
    MAIL_FROM:"support@myworkstation.gr",
    MAIL_TEST_RECIPIENT:"owner@example.com"
  });
  assert.equal(status.configured,true);
  assert.deepEqual(status.missing,[]);
});
