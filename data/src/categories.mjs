// Display metadata for the standard category ids used across wards.
// Ward-specific names, rules and links come from data/research/<ward>.json.
// fate: what happens after collection in the Tokyo 23-ward system (general description).

export const categoryMeta = {
  burnable: {
    en: "Burnable waste", color: "#d9480f", icon: "🔥",
    fate: {
      ja: "清掃工場で焼却され、熱は発電に使われる。焼却灰は東京湾の埋立処分場へ運ばれるか、一部はセメント原料などに再利用される。",
      en: "Burned at a ward incineration plant whose heat generates electricity; the ash goes to the Tokyo Bay landfill or is partly reused as cement material.",
    },
  },
  nonburnable: {
    en: "Non-burnable waste", color: "#495057", icon: "🧱",
    fate: {
      ja: "不燃ごみ処理センターで破砕され、鉄やアルミを回収したあと、残りは埋め立てられる。",
      en: "Crushed at a non-burnable waste processing centre; iron and aluminium are recovered and the rest goes to landfill.",
    },
  },
  plastic: {
    en: "Plastic (recyclable)", color: "#1c7ed6", icon: "♻️",
    fate: {
      ja: "選別施設で異物を除いたあと、プラスチック製品の原料などにリサイクルされる。",
      en: "Cleaned of contaminants at a sorting facility and recycled into raw material for new plastic products.",
    },
  },
  "pet-bottle": {
    en: "PET bottles", color: "#0ca678", icon: "🧴",
    fate: {
      ja: "フレークにされ、新しいペットボトルや繊維・シートに生まれ変わる。",
      en: "Shredded into flakes and made into new PET bottles, fibre or sheet.",
    },
  },
  "glass-bottle": {
    en: "Glass bottles", color: "#2b8a3e", icon: "🍾",
    fate: {
      ja: "色別に分けて砕かれ（カレット）、新しいびんなどの原料になる。リターナブルびんは洗って再使用される。",
      en: "Sorted by colour and crushed into cullet for new bottles; returnable bottles are washed and reused.",
    },
  },
  can: {
    en: "Cans", color: "#f08c00", icon: "🥫",
    fate: {
      ja: "アルミ缶は新しい缶や自動車部品に、スチール缶は鉄製品の原料になる。",
      en: "Aluminium cans become new cans or car parts; steel cans become new steel products.",
    },
  },
  paper: {
    en: "Paper recycling", color: "#8d6e2f", icon: "📰",
    fate: {
      ja: "製紙工場で溶かされ、新聞紙・段ボール・トイレットペーパーなどの再生紙になる。",
      en: "Pulped at a paper mill and made into recycled newsprint, cardboard or toilet paper.",
    },
  },
  carton: {
    en: "Paper cartons", color: "#a9711f", icon: "🥛",
    fate: {
      ja: "良質な紙の繊維が回収され、トイレットペーパーなどに再生される。",
      en: "The high-quality fibre is recovered and made into toilet paper and similar products.",
    },
  },
  "spray-can": {
    en: "Spray cans and gas canisters", color: "#e03131", icon: "⚠️",
    fate: {
      ja: "中身のガスを抜いたうえで金属として資源化される。中身が残ると収集車や施設の火災の原因になる。",
      en: "Emptied of gas and recycled as metal; cans with gas left in them cause garbage-truck and plant fires.",
    },
  },
  hazardous: {
    en: "Hazardous waste", color: "#c2255c", icon: "☣️",
    fate: {
      ja: "専門の施設で処理され、水銀などの有害物質が回収される。",
      en: "Processed at a specialist facility where mercury and other harmful substances are recovered.",
    },
  },
  oversized: {
    en: "Oversized (bulky) waste", color: "#6741d9", icon: "🛋️",
    fate: {
      ja: "粗大ごみ破砕処理施設で砕かれ、金属を回収したあと、燃える部分は焼却される。",
      en: "Shredded at the bulky-waste plant; metals are recovered and the combustible part is burned.",
    },
  },
  "small-appliance": {
    en: "Small appliances (recycling)", color: "#0b7285", icon: "🔌",
    fate: {
      ja: "小型家電リサイクル法に基づき、金・銀・銅やレアメタルが回収される。",
      en: "Recycled under the Small Home Appliance Recycling Act to recover gold, silver, copper and rare metals.",
    },
  },
  "appliance-recycling": {
    en: "Home appliance recycling (not collected by the ward)", color: "#364fc7", icon: "🏭",
    fate: {
      ja: "家電リサイクル法に基づきメーカーのリサイクル工場で解体され、金属やフロンが回収される。",
      en: "Taken apart at a manufacturer's recycling plant under the Home Appliance Recycling Law; metals and refrigerant gases are recovered.",
    },
  },
  "pc-recycling": {
    en: "PC recycling (not collected by the ward)", color: "#3b5bdb", icon: "💻",
    fate: {
      ja: "資源有効利用促進法に基づきメーカー等が回収し、金属などを再資源化する。",
      en: "Collected by the manufacturer (or a certified recycler) under the Resource Recycling Law, and its metals are recycled.",
    },
  },
  "store-takeback": {
    en: "Store / collection-box take-back", color: "#087f5b", icon: "🏪",
    fate: {
      ja: "販売店や回収箱から専門の事業者に送られ、金属などがリサイクルされる。発火の危険があるため家庭ごみに混ぜない。",
      en: "Sent from shops or collection boxes to specialist recyclers who recover the metals; kept out of household waste because of the fire risk.",
    },
  },
  fluorescent: {
    en: "Fluorescent tubes", color: "#ae3ec9", icon: "💡",
    fate: {
      ja: "専門の施設で水銀を回収し、ガラスや金属も資源化される。",
      en: "Sent to a specialist facility that recovers the mercury and recycles the glass and metal.",
    },
  },
  "ward-dropoff": {
    en: "Ward drop-off points", color: "#20c997", icon: "📦",
    fate: {
      ja: "区の施設の回収ボックスから資源化ルートへ送られる。",
      en: "Taken from the ward's drop-off boxes to a recycling route.",
    },
  },
  "contact-office": {
    en: "Ask the waste collection office", color: "#f59f00", icon: "☎️",
    fate: {
      ja: "清掃事務所の指示に従って個別に処理される。",
      en: "Handled individually as instructed by the ward's waste collection office.",
    },
  },
  unlisted: {
    en: "Not listed by the ward", color: "#adb5bd", icon: "❔",
    fate: {
      ja: "区の資料に記載がないため、出し方は清掃事務所に確認する。",
      en: "The ward's materials do not list it, so check with the waste collection office before putting it out.",
    },
  },
  consult: {
    en: "Ask the waste collection office", color: "#f59f00", icon: "☎️",
    fate: {
      ja: "区の案内に記載がないため、清掃事務所の指示に従って処理される。",
      en: "The ward publishes no rule for it, so it is handled as the waste collection office instructs.",
    },
  },
  toilet: {
    en: "Flush down the toilet", color: "#74c0fc", icon: "🚽",
    fate: {
      ja: "下水道を通って水再生センターで処理される。",
      en: "Goes through the sewer to a water reclamation centre.",
    },
  },
  "not-collected": {
    en: "Not collected by the ward", color: "#868e96", icon: "🚫",
    fate: {
      ja: "区では収集しない。販売店・専門業者・メーカーの回収ルートで処理される。",
      en: "Not collected by the ward; disposed of through the retailer, a specialist contractor or the manufacturer's take-back route.",
    },
  },
};
