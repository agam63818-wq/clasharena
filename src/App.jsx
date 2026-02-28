import { motion } from "framer-motion";
import { Home, Trophy, Wallet, User } from "lucide-react";

export default function App() {
  const modes = [
    { title: "Battle Royale" },
    { title: "Power Duo" },
    { title: "Squad War" },
    { title: "Clash Arena" },
    { title: "Pro Scrims" },
    { title: "Championship" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070c1f] to-[#0d1535] text-white flex flex-col">

      {/* Top Navbar */}
      <div className="flex justify-between items-center px-6 py-4 bg-[#0f172a] border-b border-white/10">
        <h1 className="text-2xl font-bold tracking-wide text-yellow-400">
          ClashArena
        </h1>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-4 py-2 rounded-full font-semibold shadow-md">
            $ 250
          </div>
          <div className="w-9 h-9 bg-yellow-400 rounded-full"></div>
        </div>
      </div>

      {/* Announcement Bar */}
      <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 text-sm px-6 py-2 border-b border-yellow-500/30">
        ⚠ Important: Incorrect Game ID may lead to disqualification.
      </div>

      {/* Hero Banner */}
      <div className="px-6 mt-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative rounded-3xl overflow-hidden shadow-2xl"
        >
          <img
            src="https://images.unsplash.com/photo-1605902711622-cfb43c4437d1"
            alt="tournament"
            className="w-full h-64 object-cover"
          />

          <div className="absolute inset-0 bg-black/60"></div>

          <div className="absolute bottom-6 left-6">
            <h2 className="text-3xl font-extrabold text-white">
              Bihar Pro League 2026
            </h2>
            <p className="text-gray-300 mt-2">
              Massive Prize Pool • Limited Slots
            </p>
            <button className="mt-4 bg-yellow-500 text-black px-6 py-2 rounded-lg font-bold hover:scale-105 transition">
              Register Now
            </button>
          </div>
        </motion.div>
      </div>

      {/* Section Title */}
      <div className="px-6 mt-10">
        <h3 className="text-xl font-bold text-gray-300">
          Battle Modes
        </h3>
      </div>

      {/* Modes Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 px-6 mt-6 pb-24">

        {modes.map((mode, i) => (
          <motion.div
            key={i}
            whileHover={{ scale: 1.07 }}
            className="relative bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-lg hover:shadow-yellow-500/20 transition"
          >

            <div className="relative h-36 rounded-xl overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1542751371-adc38448a05e"
                className="w-full h-full object-cover"
                alt="mode"
              />
              <div className="absolute inset-0 bg-black/60"></div>
              <div className="absolute bottom-3 left-3 text-yellow-400 font-bold text-lg">
                {mode.title}
              </div>
            </div>

            <button className="mt-4 w-full bg-yellow-500 text-black font-bold py-2 rounded-lg hover:bg-yellow-400 transition">
              Explore
            </button>

          </motion.div>
        ))}

      </div>

      {/* Bottom Navbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0b1025] border-t border-white/10 flex justify-around py-3 text-gray-400">

        <div className="flex flex-col items-center text-yellow-400">
          <Home size={22} />
          <span className="text-xs mt-1">Home</span>
        </div>

        <div className="flex flex-col items-center">
          <Trophy size={22} />
          <span className="text-xs mt-1">Tournaments</span>
        </div>

        <div className="flex flex-col items-center">
          <Wallet size={22} />
          <span className="text-xs mt-1">Wallet</span>
        </div>

        <div className="flex flex-col items-center">
          <User size={22} />
          <span className="text-xs mt-1">Profile</span>
        </div>

      </div>

    </div>
  );
}