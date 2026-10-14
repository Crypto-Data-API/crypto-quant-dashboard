"use client";

/**
 * shadcn/ui-style primitives (new-york style, Tailwind v4, radix-ui), kept in one module.
 * The shadcn CLI can still add components alongside (see components.json).
 */
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive, Slot, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

// ---- Button ------------------------------------------------------------------

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-110",
        secondary: "border border-[#1c2531] bg-[#0d1219] text-[#c9d3df] hover:border-[#2a3748] hover:text-white",
        outline: "border border-[#1c2531] bg-transparent text-[#9aa8b8] hover:border-[#2a3748] hover:text-[#e6edf5]",
        ghost: "text-[#8b98a9] hover:bg-[rgba(255,255,255,0.035)] hover:text-[#e6edf5]",
      },
      size: {
        default: "h-9 rounded-lg px-3 text-[12px]",
        sm: "h-7 rounded-[7px] px-2.5 text-[11px]",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

// ---- Card --------------------------------------------------------------------

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("flex flex-col rounded-[14px] border border-[#17202b] bg-[#0b0f14] text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex items-start justify-between gap-3 px-5 pt-[18px] pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("text-[13.5px] leading-tight font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5 pb-[18px]", className)} {...props} />;
}

// ---- Badge -------------------------------------------------------------------

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] border px-[7px] py-[2px] font-mono text-[10px] leading-[1.35] font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[#1c2531] bg-[#0d1219] text-[#c9d3df]",
        outline: "border-[#1c2531] text-[#8b98a9]",
        good: "border-[rgba(46,230,166,0.4)] bg-[rgba(46,230,166,0.1)] text-[#2ee6a6]",
        warning: "border-[rgba(255,181,71,0.4)] bg-[rgba(255,181,71,0.1)] text-[#ffb547]",
        serious: "border-[rgba(255,122,61,0.4)] bg-[rgba(255,122,61,0.1)] text-[#ff7a3d]",
        critical: "border-[rgba(255,92,108,0.4)] bg-[rgba(255,92,108,0.1)] text-[#ff5c6c]",
        info: "border-[rgba(76,155,255,0.4)] bg-[rgba(76,155,255,0.1)] text-[#4c9bff]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ---- Table -------------------------------------------------------------------

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="scrollbar-thin relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-[11.5px]", className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:border-[#131a23]", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b border-[#0f141b] transition-colors hover:bg-[rgba(255,255,255,0.025)] data-[state=selected]:bg-[rgba(76,155,255,0.08)]", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("h-8 px-3 text-left align-middle font-mono text-[9.5px] font-normal tracking-[0.06em] whitespace-nowrap text-[#5b6878] uppercase", className)}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("num px-3 py-[7px] align-middle whitespace-nowrap", className)} {...props} />;
}

// ---- Tabs --------------------------------------------------------------------

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex w-fit items-center gap-[2px] rounded-[9px] border border-[#1c2531] bg-[#080b10] p-[3px] text-[#8b98a9]", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=active]:bg-[#1a2230] data-[state=active]:text-[#eef3f8]",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />;
}

// ---- Tooltip -----------------------------------------------------------------

export function TooltipProvider({ delayDuration = 120, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

/** Hover/focus tooltip. Tooltips enhance; every value they show is also reachable elsewhere. */
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-[7px] border border-[#2a3442] bg-[rgba(7,10,14,0.96)] px-2.5 py-1.5 text-[11.5px] leading-[1.55] text-[#c9d3df] shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---- Sheet (side drawer) -------------------------------------------------------

export function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(3,5,8,0.55)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[#222c39] bg-[#0b0f14] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] sm:max-w-xl data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#131a23] px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.01em]">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-[12px] text-[#8b98a9]">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Close">
            <X />
          </DialogPrimitive.Close>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ---- Form controls -------------------------------------------------------------

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-[30px] w-full min-w-0 rounded-lg border border-[#1c2531] bg-[#080b10] px-2.5 font-mono text-[12px] text-[#e6edf5] outline-none placeholder:text-[#5b6878] focus-visible:border-[#2f3d50]",
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-[30px] rounded-lg border border-[#1c2531] bg-[#080b10] px-2 text-[12px] text-[#e6edf5] outline-none focus-visible:border-[#2f3d50]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("flex items-center gap-[7px] text-[11.5px] text-[#8b98a9]", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("cq-skel", className)} {...props} />;
}
