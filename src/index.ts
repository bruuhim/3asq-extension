/// <reference path="../typing/manga-provider.d.ts" />

class Provider {
    private api = "https://3asq.org"

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    // Returns the search results based on the query.
    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.api}/?s=${encodeURIComponent(opts.query)}&post_type=wp-manga`
        const resp = await fetch(url)
        const html = await resp.text()

        const results: SearchResult[] = []
        
        // Find each manga entry container
        // Madara theme usually has results in .c-tabs-item__content or .tab-content-wrap
        // Use a more generic regex to find title blocks and then work from there
        const titleBlockRegex = /<div class="post-title">[\s\S]*?<h3 class="h4"><a href="https:\/\/3asq\.org\/manga\/([^/]+)\/">([^<]+)<\/a><\/h3>/g
        
        let match
        while ((match = titleBlockRegex.exec(html)) !== null) {
            const slug = match[1]
            const title = match[2].trim()
            
            // Look for the image associated with this slug in the HTML
            // Search for the anchor that contains the image for this manga
            const imgRegex = new RegExp(`<a href="https:\\/\\/3asq\\.org\\/manga\\/${slug}\\/"[^>]*>\\s*<img[^>]*src="\\s*([^"\\s]+)\\s*"`, "i")
            const imgMatch = html.match(imgRegex)
            
            results.push({
                id: slug,
                title: title,
                image: imgMatch ? imgMatch[1].trim() : undefined
            })
        }

        return results
    }

    // Returns the chapters based on the manga ID (slug).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const url = `${this.api}/manga/${mangaId}/`
        const resp = await fetch(url)
        const html = await resp.text()

        const chapters: ChapterDetails[] = []
        
        // Madara chapters are in li.wp-manga-chapter
        const chapterRegex = /<li class="[^"]*wp-manga-chapter[^"]*">\s*<a href="https:\/\/3asq\.org\/manga\/[^/]+\/([^/]+)\/">\s*([^<]+)\s*<\/a>/g
        let match
        let index = 0
        
        while ((match = chapterRegex.exec(html)) !== null) {
            const chapterSlug = match[1]
            const chapterTitle = match[2].trim()
            
            chapters.push({
                id: `${mangaId}/${chapterSlug}`, // Combined ID
                url: `${this.api}/manga/${mangaId}/${chapterSlug}/`,
                title: chapterTitle,
                chapter: chapterSlug,
                index: index++
            })
        }

        // Return sorted in ascending order (Seanime requirement)
        return chapters.reverse()
    }

    // Returns the chapter pages based on the chapter ID (mangaSlug/chapterSlug).
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const url = `${this.api}/manga/${chapterId}/`
        const resp = await fetch(url)
        const html = await resp.text()

        const pages: ChapterPage[] = []
        
        // Madara images are in .reading-content
        // Extract all img tags with the wp-manga-chapter-img class
        // Use a 2-step approach: match the tag, then the src, to be order-independent
        const imgTagRegex = /<img[^>]*class="[^"]*wp-manga-chapter-img[^"]*"[^>]*>/g
        let tagMatch
        let index = 0
        
        while ((tagMatch = imgTagRegex.exec(html)) !== null) {
            const tag = tagMatch[0]
            const srcMatch = tag.match(/src="\s*([^"\s]+)\s*"/)
            
            if (srcMatch) {
                pages.push({
                    url: srcMatch[1].trim(),
                    index: index++,
                    headers: {
                        "Referer": `${this.api}/`
                    }
                })
            }
        }

        return pages
    }
}
