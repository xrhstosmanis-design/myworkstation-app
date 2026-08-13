const FULL_LABEL = "Ολόκληρη συναλλαγή";
const ITEMS_LABEL = "Συγκεκριμένα προϊόντα";

function enforceItemsOnlyReturn() {
  document.querySelectorAll(".pos-return-flow .pos-return-modes").forEach((modes) => {
    const buttons = [...modes.querySelectorAll("button")];
    const full = buttons.find((button) => button.textContent?.trim() === FULL_LABEL);
    const items = buttons.find((button) => button.textContent?.trim() === ITEMS_LABEL);
    if (!items) return;

    // The Store POS return flow is items-only. Selecting all visible lines
    // remains the supported way to return every item from a sale.
    if (!items.classList.contains("active")) items.click();
    full?.remove();
    modes.dataset.returnMode = "ITEMS_ONLY";
  });
}

export function installReturnItemsOnly() {
  if (globalThis.__mwsReturnItemsOnlyInstalled) return;
  globalThis.__mwsReturnItemsOnlyInstalled = true;
  enforceItemsOnlyReturn();
  const observer = new MutationObserver(enforceItemsOnlyReturn);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installReturnItemsOnly();
