import jwt from "jsonwebtoken";

export function auth(req,res,next){
  const token = req.headers.authorization?.replace("Bearer ","");
  if(!token) return res.status(401).json({error:"Απαιτείται σύνδεση."});
  try{
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  }catch{
    res.status(401).json({error:"Η συνεδρία έληξε."});
  }
}
