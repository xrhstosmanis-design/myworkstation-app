// Pure validation only. The authenticated transport owns receipt/request binding.
const fail=()=>{throw Object.assign(new Error('Δεν επιβεβαιώθηκε μία πλήρης πληρωμή κάρτας από την ταμειακή.'),{status:409,code:'FTEXT_CARD_PAYMENT_UNVERIFIED'})};
const cents=value=>{if(typeof value!=='string'||!/^(0|[1-9]\d{0,8})\.\d{2}$/.test(value))fail();return BigInt(value.replace('.',''))};
export function validateFtextCardPayment(payments,total){
 if(!Array.isArray(payments)||payments.length!==1)fail();
 const p=payments[0];
 if(!p||Object.keys(p).sort().join(',')!=='amount,cardNumberMasked,cardType'||typeof p.cardType!=='string'||!p.cardType.trim()||p.cardType!==p.cardType.trim()||p.cardType.length>60||/[#;|\x00-\x1f\x7f-\x9f]/.test(p.cardType)||/iris|\d{7}/i.test(p.cardType)||typeof p.cardNumberMasked!=='string'||p.cardNumberMasked.length<13||p.cardNumberMasked.length>19||!/^\d{0,6}\*{6,15}\d{4}$/.test(p.cardNumberMasked)||cents(p.amount)<=0n||cents(p.amount)!==cents(total))fail();
 return {cardType:p.cardType,amount:p.amount,cardNumberMasked:p.cardNumberMasked};
}
