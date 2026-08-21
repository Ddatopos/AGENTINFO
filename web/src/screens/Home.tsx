import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import HeroSection from '../components/layout/HeroSection'
import StatsBar from '../components/layout/StatsBar'
import CategoryFilter from '../components/home/CategoryFilter'
import HotFeed from '../components/home/HotFeed'
import SearchInsights from '../components/home/SearchInsights'

export default function Home() {
  const [searchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') ?? ''
  const [categoryFilter, setCategoryFilter] = useState('')

  return (
    <div className="min-h-screen">
      <HeroSection />
      <StatsBar />

      <div className="mx-auto max-w-7xl px-4 md:px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] gap-6">
          <div className="hidden lg:block">
            <CategoryFilter
              selectedCategory={categoryFilter}
              onCategoryChange={setCategoryFilter}
            />
          </div>

          <div>
            <HotFeed categoryFilter={categoryFilter} searchQuery={searchQuery} />
          </div>

          <div>
            <SearchInsights />
          </div>
        </div>
      </div>
    </div>
  )
}
