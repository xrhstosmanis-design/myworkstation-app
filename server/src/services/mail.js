import nodemailer from "nodemailer";

const DEFAULT_PORT=465;

export function getMailConfig(env=process.env){
  const port=Number(env.SMTP_PORT||DEFAULT_PORT);
  return {
    host:String(env.SMTP_HOST||"").trim(),
    port:Number.isInteger(port)&&port>0?port:DEFAULT_PORT,
    secure:String(env.SMTP_SECURE??"true").toLowerCase()!=="false",
    user:String(env.SMTP_USER||"").trim(),
    password:String(env.SMTP_PASSWORD||""),
    from:String(env.MAIL_FROM||env.SMTP_USER||"").trim(),
    testRecipient:String(env.MAIL_TEST_RECIPIENT||"").trim()
  };
}

export function getMailStatus(env=process.env){
  const config=getMailConfig(env);
  const missing=[];
  if(!config.host)missing.push("SMTP_HOST");
  if(!config.user)missing.push("SMTP_USER");
  if(!config.password)missing.push("SMTP_PASSWORD");
  if(!config.from)missing.push("MAIL_FROM");
  if(!config.testRecipient)missing.push("MAIL_TEST_RECIPIENT");
  return {
    configured:missing.length===0,
    missing,
    host:config.host||null,
    port:config.port,
    secure:config.secure,
    from:config.from||null,
    testRecipient:config.testRecipient||null
  };
}

function requireMailConfig(){
  const status=getMailStatus();
  if(!status.configured){
    const error=new Error(`Η υπηρεσία email δεν έχει ρυθμιστεί πλήρως: ${status.missing.join(", ")}`);
    error.status=503;
    throw error;
  }
  return getMailConfig();
}

export async function sendTestEmail(){
  const config=requireMailConfig();
  const transport=nodemailer.createTransport({
    host:config.host,
    port:config.port,
    secure:config.secure,
    auth:{user:config.user,pass:config.password},
    connectionTimeout:15000,
    greetingTimeout:15000,
    socketTimeout:20000
  });
  const sentAt=new Date();
  const result=await transport.sendMail({
    from:`MyWorkStation <${config.from}>`,
    to:config.testRecipient,
    subject:"ΔΟΚΙΜΗ EMAIL MYWORKSTATION",
    text:`Η ασφαλής σύνδεση email του MyWorkStation λειτουργεί.\n\nΗμερομηνία δοκιμής: ${sentAt.toISOString()}`,
    html:`<h2>MyWorkStation</h2><p>Η ασφαλής σύνδεση email λειτουργεί.</p><p><strong>Ημερομηνία δοκιμής:</strong> ${sentAt.toISOString()}</p>`
  });
  return {messageId:result.messageId,sentAt:sentAt.toISOString(),recipient:config.testRecipient};
}
