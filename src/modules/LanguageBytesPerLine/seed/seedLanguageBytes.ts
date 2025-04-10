
import dataSource from "../../../database/data-source";

import { LanguageBytesPerLineEntity } from "../entity/languageBytesPerLine.entity";

const seedData = async () => {
  await dataSource.initialize();

  const repo = dataSource.getRepository(LanguageBytesPerLineEntity);

  const existing = await repo.count();
  if (existing === 0) {
    await repo.save([
      { language: "JavaScript", avgBytesPerLine: 20 },
      { language: "TypeScript", avgBytesPerLine: 20 },
      { language: "Java", avgBytesPerLine: 15 },
      { language: "Python", avgBytesPerLine: 10 },
      { language: "Ruby", avgBytesPerLine: 10 },
      { language: "PHP", avgBytesPerLine: 15 },
      { language: "C++", avgBytesPerLine: 15 },
      { language: "C", avgBytesPerLine: 15 },
      { language: "Go", avgBytesPerLine: 15 },
      { language: "Swift", avgBytesPerLine: 15 },
      { language: "Kotlin", avgBytesPerLine: 15 },
      { language: "HTML", avgBytesPerLine: 30 },
      { language: "CSS", avgBytesPerLine: 25 },
      { language: "SCSS", avgBytesPerLine: 25 },
      { language: "JSON", avgBytesPerLine: 40 },
    ]);
    console.log("Seeded language byte info.");
  } else {
    console.log("Language byte info already seeded.");
  }

  await dataSource.destroy();
};

seedData().catch(console.error);
