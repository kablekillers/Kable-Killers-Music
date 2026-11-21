import { useManifest } from "@/hooks/use-manifest";
import { InstallSection } from "@/components/InstallSection";
import { motion } from "framer-motion";
import { Music, Radio, Zap } from "lucide-react";

export default function Home() {
  const { data: manifest, isLoading } = useManifest();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-cover bg-bottom"
           style={{ backgroundImage: "url('/background.png')" }}>
      </div>
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_hsl(42_62%_53%/0.12),_transparent_60%)]" />
      
      {/* Diagonal Strip */}
      

      <div className="container relative z-10 px-4 py-16 mx-auto flex flex-col items-center text-center">
        
        {/* Logo / Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-12"
        >
          <img
            src="/logo.png"
            alt="Kable Killers Music"
            className="w-36 h-36 mx-auto mb-8 rounded-[28px] shadow-[0_0_60px_-10px_hsl(42_62%_53%/0.55)]"
          />
          
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase mb-4 leading-none">
            <span className="bg-gradient-to-br from-[#F5D78E] via-[#D4A93C] to-[#9C7420] bg-clip-text text-transparent">Kable Killers</span>
            <span className="block text-foreground text-3xl md:text-4xl tracking-[0.35em] mt-3 font-light">MUSIC</span>
          </h1>
          
          <div className="h-2 w-24 bg-primary mx-auto mb-6" />

          <p className="text-xl md:text-2xl font-light text-muted-foreground max-w-2xl mx-auto">
            Search and stream music right inside Kable Killers: tracks, live radio and full concerts, all in one place.
          </p>
          
          {isLoading ? (
            <div className="mt-4 h-6 w-32 bg-muted animate-pulse mx-auto rounded" />
          ) : (
            <p className="mt-2 text-sm font-mono text-muted-foreground/60">
              v{manifest?.version || "1.0.0"} • {manifest?.id || "org.kablekillers.music"}
            </p>
          )}
        </motion.div>

        {/* Feature Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl mb-16"
        >
          <FeatureCard 
            icon={<Music className="w-6 h-6" />}
            title="Music"
            description="SoundCloud, Audius, 30,000+ live radio stations and Internet Archive concerts."
          />
          <FeatureCard 
            icon={<Zap className="w-6 h-6" />}
            title="Fast"
            description="Optimized for speed. Lightweight efficient streaming with no bloat."
          />
          <FeatureCard 
            icon={<Radio className="w-6 h-6" />}
            title="Simple"
            description="Just install and play. No configuration required."
          />
        </motion.div>

        {/* Installation Area */}
        <div className="w-full max-w-md relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-primary/5 blur-xl opacity-60 -z-10" />
          <InstallSection />
        </div>

      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 text-xs font-mono text-muted-foreground text-center w-full opacity-60">
        <p>Kable Killers Music &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center p-6 bg-card/80 backdrop-blur border border-border/60 rounded-2xl hover:border-primary/50 transition-colors duration-300">
      <div className="mb-4 p-3 bg-secondary rounded-full text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2 font-display">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
