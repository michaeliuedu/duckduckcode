import { ModeChooser } from "@/components/ModeChooser";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <header className="mb-10">
          <p className="text-sm font-medium tracking-wide text-amber-400 uppercase">duckduckcode</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Office hours, one shared editor.</h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Create a workspace, send the link to your student or TA, and code together in real time. Everything is saved
            automatically so a refresh or a dropped connection never loses work.
          </p>
        </header>
        <ModeChooser />
      </div>
    </main>
  );
}
