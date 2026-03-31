'use client'

import { useState, useEffect, useRef } from 'react'

interface TypewriterOptions {
  words: string[]
  typeSpeed?: number
  deleteSpeed?: number
  delayBetweenWords?: number
  loop?: boolean
}

export function useTypewriter({
  words,
  typeSpeed = 100,
  deleteSpeed = 50,
  delayBetweenWords = 2000,
  loop = true,
}: TypewriterOptions) {
  const [currentText, setCurrentText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (words.length === 0) return

    const currentWord = words[currentIndex]

    const handleTyping = () => {
      if (isPaused) {
        timeoutRef.current = setTimeout(() => {
          setIsPaused(false)
          setIsDeleting(true)
        }, delayBetweenWords)
        return
      }

      if (!isDeleting) {
        // Typing
        if (currentText.length < currentWord.length) {
          setCurrentText(currentWord.slice(0, currentText.length + 1))
          timeoutRef.current = setTimeout(handleTyping, typeSpeed)
        } else {
          // Finished typing, pause before deleting
          setIsPaused(true)
          timeoutRef.current = setTimeout(handleTyping, delayBetweenWords)
        }
      } else {
        // Deleting
        if (currentText.length > 0) {
          setCurrentText(currentText.slice(0, -1))
          timeoutRef.current = setTimeout(handleTyping, deleteSpeed)
        } else {
          // Finished deleting, move to next word
          setIsDeleting(false)
          if (loop || currentIndex < words.length - 1) {
            setCurrentIndex((prev) => (prev + 1) % words.length)
          }
        }
      }
    }

    timeoutRef.current = setTimeout(handleTyping, isDeleting ? deleteSpeed : typeSpeed)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [currentText, currentIndex, isDeleting, isPaused, words, typeSpeed, deleteSpeed, delayBetweenWords, loop])

  return currentText
}
