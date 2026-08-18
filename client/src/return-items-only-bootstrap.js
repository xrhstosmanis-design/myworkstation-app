const FULL_LABEL = "Ολόκληρη συναλλαγή";
const ITEMS_LABEL = "Συγκεκριμένα προϊόντα";

function preserveBothReturnModes() {
  document.querySelectorAll(".pos-return-flow .pos-return-modes").forEach((modes) => {
    const labels=[...modes.querySelectorAll("button")].map(button=>button.textContent?.trim());
    if(labels.includes(FULL_LABEL)&&labels.includes(ITEMS_LABEL))modes.dataset.returnMode="FULL_AND_ITEMS";
  });
}

export function installReturnModeCompatibility() {
  if (globalThis.__mwsReturnModesInstalled) return;
  globalThis.__mwsReturnModesInstalled = true;
  preserveBothReturnModes();
  const observer = new MutationObserver(preserveBothReturnModes);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

installReturnModeCompatibility();
