import { db } from "./db";
import { mainTasks, subTasks } from "@shared/schema";
import XLSX from "xlsx";
import { eq } from "drizzle-orm";

interface ParsedTask {
  description: string;
  reviewLevel: number;
  hasSubTasks: boolean;
  subTasks: string[];
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string, reviewLevel: number): ParsedTask[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | null)[][];
  
  const tasks: ParsedTask[] = [];
  let currentMainTask: ParsedTask | null = null;
  
  data.forEach((row) => {
    const col1 = row[0];
    const col3 = row[2];
    
    if (col1 && typeof col1 === 'string' && col1.trim()) {
      currentMainTask = {
        description: col1.trim(),
        reviewLevel: reviewLevel,
        hasSubTasks: false,
        subTasks: []
      };
      tasks.push(currentMainTask);
    }
    
    if (col3 && typeof col3 === 'string' && col3.trim() && currentMainTask) {
      currentMainTask.subTasks.push(col3.trim());
      currentMainTask.hasSubTasks = true;
    }
  });
  
  return tasks;
}

async function seedTasks() {
  console.log("Starting task import from spreadsheet...");
  
  const workbook = XLSX.readFile('attached_assets/Billing_Descriptions_1768062204279.xlsx');
  
  const level1Tasks = parseSheet(workbook, 'First-Level Review', 1);
  const level2Tasks = parseSheet(workbook, 'Second-Level Review', 2);
  
  console.log(`Found ${level1Tasks.length} Level 1 tasks`);
  console.log(`Found ${level2Tasks.length} Level 2 tasks`);
  
  const allTasks = [...level1Tasks, ...level2Tasks];
  
  let mainTaskOrder = 1;
  
  for (const task of allTasks) {
    const existingMain = await db.query.mainTasks.findFirst({
      where: eq(mainTasks.description, task.description)
    });
    
    let mainTaskId: number;
    
    if (existingMain) {
      console.log(`Skipping existing main task: ${task.description.substring(0, 50)}...`);
      mainTaskId = existingMain.id;
    } else {
      const [newMainTask] = await db.insert(mainTasks).values({
        description: task.description,
        reviewLevel: task.reviewLevel,
        hasSubTasks: task.hasSubTasks,
        displayOrder: mainTaskOrder++,
        status: "Active",
      }).returning();
      
      mainTaskId = newMainTask.id;
      console.log(`Created main task: ${task.description.substring(0, 50)}...`);
    }
    
    let subTaskOrder = 1;
    for (const subTaskDesc of task.subTasks) {
      const existingSub = await db.query.subTasks.findFirst({
        where: eq(subTasks.description, subTaskDesc)
      });
      
      if (existingSub) {
        console.log(`  Skipping existing subtask: ${subTaskDesc.substring(0, 40)}...`);
      } else {
        await db.insert(subTasks).values({
          mainTaskId: mainTaskId,
          description: subTaskDesc,
          displayOrder: subTaskOrder++,
          status: "Active",
        });
        console.log(`  Created subtask: ${subTaskDesc.substring(0, 40)}...`);
      }
    }
  }
  
  console.log("\nTask import completed!");
}

seedTasks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error seeding tasks:", err);
    process.exit(1);
  });
