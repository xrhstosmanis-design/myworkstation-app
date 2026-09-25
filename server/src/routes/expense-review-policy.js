export function expenseReviewStatus(user){
  const ownerAction=user?.tokenType!=="STORE_OPERATOR"&&
    (user?.role==="OWNER"||user?.role==="SUPER_ADMIN"||user?.platformRole==="SUPER_ADMIN"||user?.isSuperAdmin===true);
  return ownerAction?"CONFIRMED":"PENDING_REVIEW";
}
