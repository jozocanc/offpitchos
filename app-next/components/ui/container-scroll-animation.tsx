"use client"
import React, { useRef } from "react"
import { useScroll, useTransform, motion, MotionValue } from "motion/react"

export const ContainerScroll = ({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode
  children: React.ReactNode
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef })
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  const scaleDimensions = () => (isMobile ? [0.8, 0.95] : [1, 1])

  const rotate = useTransform(scrollYProgress, [0, 0.5], [25, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.95, scaleDimensions()[1]])

  return (
    <div
      ref={containerRef}
      className="relative w-full pt-12 pb-24 md:pt-20 md:pb-32"
      style={{ perspective: "1000px" }}
    >
      <div className="max-w-5xl mx-auto px-6 text-center mb-12 md:mb-16">
        {titleComponent}
      </div>
      <Card rotate={rotate} scale={scale}>
        {children}
      </Card>
    </div>
  )
}

const Card = ({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>
  scale: MotionValue<number>
  children: React.ReactNode
}) => {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          "0 40px 80px -20px rgba(15,21,16,0.18), 0 20px 40px -20px rgba(31,78,61,0.12)",
        transformOrigin: "center top",
      }}
      className="max-w-5xl mx-auto h-[22rem] sm:h-[28rem] md:h-[36rem] w-[92%] border-[6px] border-[#1F4E3D] p-2 md:p-4 bg-[#FFFFFF] rounded-[30px]"
    >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-[#FAF7F2]">
        {children}
      </div>
    </motion.div>
  )
}
