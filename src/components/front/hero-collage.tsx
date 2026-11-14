import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { HERO_COLUMNS, type LandingImage } from "@/lib/landing-images";
import { cn } from "@/lib/utils";

const RATIO: Record<LandingImage["ratio"], string> = { "1/1": "aspect-square", "3/4": "aspect-[3/4]", "4/5": "aspect-[4/5]", "2/3": "aspect-[2/3]" };

/** How far down each column starts: a staircase that climbs to the right, beside the headline on wide screens. */
const OFFSET = ["mt-16 xl:mt-[36rem]", "mt-8 xl:mt-[33rem]", "mt-0 xl:mt-[30rem]", "md:mt-12 xl:mt-[9rem]", "md:mt-6 xl:mt-[4rem]", "md:mt-0"];

function Tile({ image, eager }: { image: LandingImage; eager: boolean }) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-2xl border border-white/12 bg-white/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_20px_40px_-24px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:rounded-3xl", RATIO[image.ratio])}>
      {image.src ? (
        <Image src={image.src} alt={image.alt} fill priority={eager} sizes="(min-width: 768px) 16vw, 33vw" className="object-cover" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(160deg,rgb(255_255_255/0.1),transparent_55%)] text-white/45">
          <ImageIcon className="h-6 w-6" strokeWidth={1.5} />
          <span className="px-2 text-center text-[11px] font-medium">{image.alt}</span>
        </div>
      )}
    </div>
  );
}

/** The wall of pictures on the landing page. Three columns on a phone, six on a wide screen. */
export function HeroCollage({ className }: { className?: string }) {
  return (
    <div className={cn("stagger flex gap-3 sm:gap-4", className)}>
      {HERO_COLUMNS.map((column, i) => (
        <div key={i} className={cn("min-w-0 flex-1 flex-col gap-3 sm:gap-4", i < 3 ? "flex" : "hidden md:flex", OFFSET[i])}>
          {column.map((image, j) => (
            <Tile key={image.alt} image={image} eager={j === 0} />
          ))}
        </div>
      ))}
    </div>
  );
}
