import React from 'react';

// One application frame for Owner and delegated personal sessions. Authorization
// stays with the native modules and server; navigation cannot grant a right.
export default function BackofficeShell({companyName,title,subtitle,navigation,footer,children,className=""}){
 return <div className={`app ${className}`}><aside><div className="brand"><div className="mark">MW</div><div><b>MyWorkStation</b><small>{companyName}</small></div></div>{navigation}{footer}</aside><main><header><div><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</main></div>;
}
