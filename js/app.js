// js/app.js

let allPitches = [];

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    // Search listener
    const areaFilter = document.getElementById('areaFilter');
    if (areaFilter) {
        areaFilter.addEventListener('change', (e) => {
            const query = e.target.value;
            filterPitches(query);
        });
        loadAreasDropdown();
    }

    // Load active pitches on home page
    if (document.getElementById('publicPitchesList')) {
        loadPublicPitches();
    }
});

async function loadPublicPitches() {
    const listDiv = document.getElementById('publicPitchesList');
    const loadingDiv = document.getElementById('loadingIndicator');
    const noResultsDiv = document.getElementById('noResults');
    
    try {
        // Fetch pitches with owner info via RPC
        const { data, error } = await supabaseClient
            .rpc('get_active_pitches_with_owners');
            
        if (error) throw error;
        
        allPitches = data || [];
        
        loadingDiv.style.display = 'none';
        
        if (allPitches.length === 0) {
            noResultsDiv.style.display = 'block';
            noResultsDiv.innerHTML = `
                <i data-lucide="frown"></i>
                <h3>لا توجد ملاعب متاحة حالياً</h3>
                <p>عذراً، لا يوجد أي ملاعب مفعلة في الوقت الحالي.</p>
            `;
            lucide.createIcons();
            return;
        }
        
        renderPitches(allPitches);
        
    } catch (error) {
        console.error('Error fetching pitches:', error);
        loadingDiv.textContent = 'حدث خطأ أثناء تحميل الملاعب.';
        loadingDiv.style.color = '#ef4444';
    }
}

function filterPitches(query) {
    if (!query) {
        renderPitches(allPitches);
        return;
    }
    
    const filtered = allPitches.filter(p => p.location === query);
    renderPitches(filtered);
}

async function loadAreasDropdown() {
    try {
        const { data, error } = await supabaseClient.from('platform_settings').select('areas').single();
        if (!error && data && data.areas) {
            const select = document.getElementById('areaFilter');
            data.areas.forEach(area => {
                const opt = document.createElement('option');
                opt.value = area;
                opt.textContent = area;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

function renderPitches(pitches) {
    const listDiv = document.getElementById('publicPitchesList');
    const noResultsDiv = document.getElementById('noResults');
    
    listDiv.innerHTML = '';
    
    if (pitches.length === 0) {
        listDiv.style.display = 'none';
        
        // Reset the default empty state icon
        noResultsDiv.innerHTML = `
            <i data-lucide="search-x"></i>
            <h3>لم نجد ملاعب تطابق بحثك</h3>
            <p>حاول استخدام كلمات بحث أخرى أو ابحث في منطقة مختلفة.</p>
        `;
        noResultsDiv.style.display = 'block';
        lucide.createIcons();
    } else {
        noResultsDiv.style.display = 'none';
        listDiv.style.display = 'grid';
        
        pitches.forEach(pitch => {
            const photoUrl = (pitch.photos && pitch.photos.length > 0) 
                ? pitch.photos[0] 
                : 'https://via.placeholder.com/600x400?text=بدون+صورة';
                
            const card = document.createElement('div');
            card.className = 'pitch-card animate-fade-in';
            card.innerHTML = `
                <div class="pitch-card-img" style="background-image: url('${photoUrl}');"></div>
                <div class="pitch-card-content">
                    <h3 style="margin-bottom:5px;">${pitch.name}</h3>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">
                        <i data-lucide="user" style="width: 14px; height: 14px; vertical-align: middle;"></i> المالك: ${pitch.owner_name || 'مالك الملعب'}
                    </div>
                    <p class="pitch-location"><i data-lucide="map-pin" style="width: 14px; height: 14px; vertical-align: middle;"></i> ${pitch.location}</p>
                    <div class="pitch-card-footer">
                        <span class="pitch-price"><strong>${pitch.price_per_hour}</strong> ج.م / ساعة</span>
                        <a href="pitch-details.html?id=${pitch.id}" class="btn btn-primary btn-sm" style="font-size: 0.9rem; padding: 6px 12px;">التفاصيل</a>
                    </div>
                </div>
            `;
            listDiv.appendChild(card);
        });
        
        lucide.createIcons();
    }
}
