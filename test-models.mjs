import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AIzaSyAHvo_4nOWeBk9yLC3sav6xXLX6SJy03Kg" });

async function list() {
  try {
    const models = await ai.models.list();
    for (const m of models) {
        console.log(m.name);
    }
  } catch (e) {
      console.log(e);
  }
}
list();