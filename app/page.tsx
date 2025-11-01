export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h1 className="text-6xl font-bold tracking-tight">
          Deadline<span className="text-blue-600">DAO</span>
        </h1>

        <p className="text-2xl text-gray-600 max-w-2xl mx-auto">
          Lock SOL to your deadline. AI validates your proof. Complete it? Get paid. Fail? Your money goes to winners.
        </p>

        <div className="flex gap-4 justify-center pt-8">
          <a
            href="/create"
            className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Create Goal
          </a>
          <a
            href="/feed"
            className="border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-50 transition-colors"
          >
            Browse Goals
          </a>
        </div>

        <div className="pt-12 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-blue-600">$0.00025</div>
            <div className="text-gray-600 mt-2">Transaction Cost</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">400ms</div>
            <div className="text-gray-600 mt-2">Payout Speed</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-600">AI</div>
            <div className="text-gray-600 mt-2">Proof Validation</div>
          </div>
        </div>
      </div>
    </main>
  );
}
