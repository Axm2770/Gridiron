// Known legacy editorial notes are removed from persisted generated stories during migration.
// Factual provenance, asset credits and licensing details remain in repository documentation.
export function migrateImmersion(s) {
  const f = s.franchise;
  if (f.immersionVersion === 1) return;
  const records = [
    ...(s.news || []),
    ...(f.events || []),
    ...(f.office?.messages || []),
    ...(f.office?.stories || []),
  ];
  for (const item of records)
    for (const key of ["title", "body", "summary"])
      if (typeof item[key] === "string") {
        item[key] = item[key]
          .replace(
            /Real NFL identities across all 32 teams\. Matched ratings use the EA snapshot with career adjustments; contracts, personalities and future events are simulated\./g,
            "The opening roster report is ready. Review your squad and meet your coaching department.",
          )
          .replace(
            /\d{4} ESPN roster identities loaded across all 32 franchises\. Matched ratings use the EA snapshot; unmatched grades and contracts are modeled\./g,
            "League rosters are registered. Your scouting department is ready for the season.",
          )
          .replace(
            /A real roster\. Your own story\./g,
            "Your opening roster report",
          )
          .replace(/ This is a simulated career event\./g, "")
          .replace(/In this fictional career event, a player/g, "A player")
          .replace(
            /A fictional tampering investigation/g,
            "A league tampering investigation",
          )
          .replace(/simulation cap/g, "salary cap");
      }
  f.immersionVersion = 1;
}
