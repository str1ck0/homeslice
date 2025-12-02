import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Homeslice
          </h1>
          <p className="text-2xl text-gray-700 dark:text-gray-300 mb-12">
            Your sharehouse, simplified.
          </p>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">Split Costs Fairly</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Track one-off and recurring expenses. Know who owes what.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">Stay Organized</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Shopping lists, reminders, and house info all in one place.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">Know Who&apos;s Home</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Check-in system to see which housemates are around.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">Manage Together</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Everyone gets their own profile and can contribute.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Link
              href="/auth"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition duration-200"
            >
              Get Started
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create an account or join your house
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
