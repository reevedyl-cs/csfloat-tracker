window.SKINS = [];
window.SKINS_READY = false;

const FALLBACK_SKINS = [
  "Desert Eagle | Blaze (Factory New)",
  "Desert Eagle | Blaze (Minimal Wear)",
  "AWP | Lightning Strike (Factory New)",
  "AWP | Lightning Strike (Minimal Wear)",
  "AWP | Lightning Strike (Field-Tested)",
  "AK-47 | Fire Serpent (Factory New)",
  "AK-47 | Fire Serpent (Minimal Wear)",
  "AK-47 | Fire Serpent (Field-Tested)",
  "AK-47 | Fire Serpent (Well-Worn)",
  "AK-47 | Fire Serpent (Battle-Scarred)",
  "M4A1-S | Blue Phosphor (Factory New)",
  "M4A1-S | Blue Phosphor (Minimal Wear)",
  "AK-47 | Redline (Field-Tested)",
  "AWP | Asiimov (Field-Tested)",
  "USP-S | Kill Confirmed (Field-Tested)",
  "Glock-18 | Fade (Factory New)"
];

async function loadAllSkins() {
  try {
    const url = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`Skin dataset request failed: ${res.status}`);
    }

    const data = await res.json();

    const names = data
      .map(item => item.market_hash_name)
      .filter(Boolean)
      .filter(name => !name.includes("StatTrak™"))
      .filter(name => !name.includes("Souvenir"));

    window.SKINS = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    window.SKINS_READY = true;

    document.dispatchEvent(new CustomEvent("skins-ready", {
      detail: { count: window.SKINS.length }
    }));
  } catch (err) {
    window.SKINS = FALLBACK_SKINS;
    window.SKINS_READY = true;

    document.dispatchEvent(new CustomEvent("skins-ready", {
      detail: { count: window.SKINS.length, fallback: true, error: err.message }
    }));
  }
}

loadAllSkins();