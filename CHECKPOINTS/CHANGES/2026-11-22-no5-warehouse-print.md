# No 5 · Printing the current inventory archive page

CENTRAL-BACKOFFICE-ACCESS-01 adds an opt-in products.print grant requiring products.read. The delegated inventory archive prints only the current page of the verified selected store. A refresh, store mismatch or changed API identity prevents printing from a stale response. The popup has an explicit six-column projection and escapes product and store text. There are no new server requests. Existing Owner print and Excel export remain available through their current paths.

Two local tests passed for the grant dependency, print scope wiring, safe output and blocked popups. This change is for the joint permissions release. Browser printing and hosted acceptance are pending.
