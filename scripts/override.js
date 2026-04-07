
Hooks.once("ready", () => {
  const sheetClasses = Object.values(CONFIG.Actor.sheetClasses)
    .flatMap(type => Object.values(type))
    .map(entry => entry.cls);

  const SpireSheetClass = sheetClasses.find(cls =>
    cls?.name?.toLowerCase().includes("spire") &&
    cls.prototype.activateListeners
  );

  if (!SpireSheetClass) {
    console.error("Spire Actor Sheet class not found.");
    return;
  }

  const originalActivate = SpireSheetClass.prototype.activateListeners;

  SpireSheetClass.prototype.activateListeners = function(html) {
    originalActivate.call(this, html);
    const root = html[0] ?? html;

    const refreshBtn = root.querySelector("#refresh-roll-button");
    if (refreshBtn) {
      const clone = refreshBtn.cloneNode(true);
      refreshBtn.replaceWith(clone);
      clone.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await runRefresh(this.actor);
      });
    }

    const falloutBtn = root.querySelector("#fallout-roll-button");
    if (falloutBtn) {
      const clone = falloutBtn.cloneNode(true);
      falloutBtn.replaceWith(clone);
      clone.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await runFallout(this.actor);
      });
    }
  };
});

async function runRefresh(actor) {
  if (!actor) return;

  new Dialog({
    title: "Roll Refresh",
    content: `
      <style>
        /* Match Spire Stress Roll dice picker (measured from screenshot) */
        .spire-dice-title {
          text-align:center;
          font-size: 34px;
          font-weight: 800;
          margin: 2px 0 8px 0;
        }
        .spire-dice-picker {
          display:flex;
          gap: 8px;                 /* screenshot gap */
          margin: 0 0 18px 0;       /* padding above Roll/Cancel */
        }
        .spire-dice-btn {
          flex: 1 1 0;
          height: 52px;             /* screenshot button height */
          border-radius: 6px;
          border: 2px solid rgba(0,0,0,0.45);
          background: rgba(0,0,0,0.07);
          font-weight: 800;
          font-size: 22px;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor: pointer;
          user-select: none;
          color: #111;
        }
        .spire-dice-btn.is-selected {
          background: #2f4f86;      /* screenshot selected blue */
          border-color: rgba(0,0,0,0.65);
          color: #ffffff;
        }
      </style>

      <form>
        <div class="spire-dice-title">Dice</div>
        <input type="hidden" id="dieSize" value="">
        <div class="spire-dice-picker">
          <div class="spire-dice-btn" data-die="3">D3</div>
          <div class="spire-dice-btn" data-die="6">D6</div>
          <div class="spire-dice-btn" data-die="8">D8</div>
        </div>
      </form>
    `,
    buttons: {
      roll: {
        label: "Roll",
        callback: async (html) => {
          const dieSize = html.find("#dieSize").val();
          if (!dieSize) {
            ui.notifications.warn("Select a die first.");
            return false;
          }
          const roll = await new Roll(`1d${dieSize}`).roll({ async: true });
          await allocateStress(actor, roll.total, "Refresh", roll);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html) => {
      html.find(".spire-dice-btn").on("click", function() {
        const die = $(this).data("die");
        html.find(".spire-dice-btn").removeClass("is-selected");
        $(this).addClass("is-selected");
        html.find("#dieSize").val(String(die));
      });
    }
  }).render(true);
}

async function runFallout(actor) {
  if (!actor) return;

  const totalStress = foundry.utils.getProperty(actor.system, "totalStress") ?? 0;
  const roll = await new Roll("1d10").roll({async:true});

  if (roll.total >= totalStress) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `
        <div class="spire chat-card">
          <header class="card-header"><h3>No Fallout</h3></header>
          <div class="card-content">${await roll.render()}<p>No Fallout occurred.</p></div>
        </div>`,
      rolls: [roll]
    });
    return;
  }

  let category = "Minor Fallout";
  let pool = 3;
  if (totalStress >= 5 && totalStress <= 8) { category = "Moderate Fallout"; pool = 5; }
  if (totalStress >= 9) { category = "Severe Fallout"; pool = 7; }

  await allocateStress(actor, pool, category, roll);
}

async function allocateStress(actor, pool, title, roll=null) {
  const keys = ["blood","mind","silver","shadow","reputation","armor"];
  const colors = {
    blood:"#b22222",
    mind:"#3a86ff",
    silver:"#555555",
    shadow:"#2b2b2b",
    reputation:"#6f42c1",
    armor:"#6c757d"
  };

  let allocations = {};
  keys.forEach(k => allocations[k] = 0);

  await new Promise(resolve => {
    new Dialog({
      title: `${title} Stress Allocation`,
      content: buildContent(),
      buttons: {
        confirm: {
          label: "Confirm",
          callback: async html => {
            let updates = {};
            let resultLines = "";

            for (const k of keys) {
              const current = foundry.utils.getProperty(actor.system, `resistances.${k}.stress`) ?? 0;
              const reduction = allocations[k] ?? 0;
              if (reduction > 0) {
                updates[`system.resistances.${k}.stress`] = current - reduction;
                resultLines += `
                  <div style="padding-left:16px;margin:2px 0;">
                    • <strong style="color:${colors[k]}">${cap(k)}</strong> reduced by ${reduction}
                  </div>`;
              }
            }

            if (Object.keys(updates).length > 0) await actor.update(updates);

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({actor}),
              content: `
                <div class="spire chat-card">
                  <header class="card-header"><h3>${title}</h3></header>
                  <div class="card-content">
                    ${roll ? await roll.render() : ""}
                    ${resultLines ? "<hr/>" + resultLines : ""}
                  </div>
                </div>`,
              rolls: roll ? [roll] : []
            });

            resolve();
          }
        },
        cancel: { label: "Cancel", callback: () => resolve() }
      },
      render: html => {
        const remainingEl = html.find("#remaining");
        const usedTotal = () => Object.values(allocations).reduce((a,b)=>a+b,0);

        function updateRemaining() {
          remainingEl.text(pool - usedTotal());
        }

        html.find("[data-key]").each(function() {
          const row = $(this);
          const key = row.data("key");
          const max = parseInt(row.data("max"));
          const valEl = row.find(".value");

          row.find(".plus").click(() => {
            if (usedTotal() >= pool) return;
            if (allocations[key] >= max) return;
            allocations[key]++;
            valEl.text(allocations[key]);
            updateRemaining();
          });

          row.find(".minus").click(() => {
            if (allocations[key] <= 0) return;
            allocations[key]--;
            valEl.text(allocations[key]);
            updateRemaining();
          });
        });

        updateRemaining();
      }
    }).render(true);
  });

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function buildContent() {
    let h = `
      <style>
        .stress-row { display:flex; justify-content:space-between; align-items:center; margin:4px 0; }
        .stress-controls button { width:28px; height:28px; }
        .stress-value { width:30px; text-align:center; font-weight:bold; }
        .remaining { font-size:1.1em; margin-bottom:8px; }
      </style>
      <form>
        <div class="remaining">Remaining Pool: <span id="remaining">${pool}</span></div>
    `;

    for (const k of keys) {
      const current = foundry.utils.getProperty(actor.system, `resistances.${k}.stress`) ?? 0;
      h += `
        <div class="stress-row" data-key="${k}" data-max="${current}">
          <span><strong style="color:${colors[k]}">${cap(k)}</strong> (Current: ${current})</span>
          <span class="stress-controls">
            <button type="button" class="minus">-</button>
            <span class="value stress-value">0</span>
            <button type="button" class="plus">+</button>
          </span>
        </div>`;
    }

    h += `</form>`;
    return h;
  }
}
