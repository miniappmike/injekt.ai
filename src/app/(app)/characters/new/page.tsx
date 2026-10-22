import { CharacterForm } from "@/components/character-form";
import { createCharacter } from "../actions";

export default function NewCharacterPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New character</h1>
      <CharacterForm action={createCharacter} submitLabel="Save character" />
    </div>
  );
}
