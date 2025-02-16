async function searchLocations() {
    const coordinates = document.getElementById('coordinates').value;
    const timeRange = parseInt(document.getElementById('timeRange').value);
    const category = document.getElementById('category').value;

    if (!coordinates) {
        alert('請輸入經緯度！');
        return;
    }

    const [lat, lng] = coordinates.split(',').map(coord => parseFloat(coord.trim()));
    
    try {
        // 創建一個隱藏的地圖元素（Places API 需要）
        const mapDiv = document.createElement('div');
        mapDiv.style.display = 'none';
        document.body.appendChild(mapDiv);
        
        const map = new google.maps.Map(mapDiv, {
            center: { lat, lng },
            zoom: 15
        });

        // 創建服務
        const placesService = new google.maps.places.PlacesService(map);
        const distanceService = new google.maps.DistanceMatrixService();

        // 設置搜索半徑（以米為單位）
        const radius = Math.min(50000, (timeRange * 60 * 1000) / 60); // 最大50公里

        // 設置搜索關鍵字
        let keywords = [];
        if (category === 'parking') {
            keywords = ['停車場', 'car park', 'parking'];
        } else {
            keywords = ['住宅', '屋苑', 'residential'];
        }

        // 使用多個關鍵字進行搜索
        let allPlaces = [];
        for (const keyword of keywords) {
            const request = {
                location: new google.maps.LatLng(lat, lng),
                radius: radius,
                keyword: keyword,
                type: category === 'parking' ? 'parking' : 'establishment'
            };

            try {
                const places = await new Promise((resolve, reject) => {
                    placesService.nearbySearch(request, (results, status) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK) {
                            resolve(results);
                        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                            resolve([]);
                        } else {
                            console.warn(`搜索關鍵字 "${keyword}" 時狀態: ${status}`);
                            resolve([]);
                        }
                    });
                });

                if (places && places.length > 0) {
                    allPlaces = allPlaces.concat(places);
                }

                // 添加短暫延遲
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`搜索關鍵字 "${keyword}" 時發生錯誤:`, error);
            }
        }

        // 去重
        allPlaces = Array.from(new Set(allPlaces.map(place => place.place_id)))
            .map(id => allPlaces.find(place => place.place_id === id))
            .filter(place => {
                if (category === 'parking') {
                    const name = place.name.toLowerCase();
                    return !name.includes('路邊') && 
                           !name.includes('單車') && 
                           !name.includes('傷殘') &&
                           !name.includes('電單車');
                }
                return true;
            });

        // 計算距離
        if (allPlaces.length === 0) {
            displayResults([]);
            return;
        }

        const batchSize = 25;
        let results = [];

        for (let i = 0; i < allPlaces.length; i += batchSize) {
            const batch = allPlaces.slice(i, i + batchSize);
            const destinations = batch.map(place => place.geometry.location);
            const origin = new google.maps.LatLng(lat, lng);

            try {
                const distanceResult = await new Promise((resolve, reject) => {
                    distanceService.getDistanceMatrix({
                        origins: [origin],
                        destinations: destinations,
                        travelMode: google.maps.TravelMode.DRIVING,
                        unitSystem: google.maps.UnitSystem.METRIC
                    }, (response, status) => {
                        if (status === 'OK') {
                            resolve(response);
                        } else {
                            reject(new Error('計算距離失敗: ' + status));
                        }
                    });
                });

                const batchResults = batch.map((place, index) => {
                    const element = distanceResult.rows[0].elements[index];
                    if (element.status === 'OK') {
                        const duration = element.duration.text;
                        const durationMinutes = parseInt(duration.match(/\d+/)[0]);

                        if (durationMinutes <= timeRange) {
                            return {
                                name: place.name,
                                address: place.vicinity || '無地址資訊',
                                category: category === 'parking' ? '停車場' : '住宅',
                                drivingTime: duration
                            };
                        }
                    }
                    return null;
                }).filter(result => result !== null);

                results = results.concat(batchResults);

                // 添加短暫延遲
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error('計算距離時發生錯誤:', error);
            }
        }

        // 按車程時間排序
        results.sort((a, b) => {
            const timeA = parseInt(a.drivingTime.match(/\d+/)[0]);
            const timeB = parseInt(b.drivingTime.match(/\d+/)[0]);
            return timeA - timeB;
        });

        displayResults(results);

        // 清理臨時創建的地圖元素
        document.body.removeChild(mapDiv);
    } catch (error) {
        alert('搜尋過程中發生錯誤：' + error.message);
        console.error(error);
    }
}

function displayResults(results) {
    const resultsDiv = document.getElementById('resultsTable');
    
    const table = `
        <table>
            <thead>
                <tr>
                    <th>名稱</th>
                    <th>地址</th>
                    <th>類別</th>
                    <th>車程時間</th>
                </tr>
            </thead>
            <tbody>
                ${results.map(result => `
                    <tr>
                        <td>${result.name}</td>
                        <td>${result.address}</td>
                        <td>${result.category}</td>
                        <td>${result.drivingTime}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    resultsDiv.innerHTML = table;
}

function exportToExcel() {
    const table = document.querySelector('table');
    if (!table) {
        alert('沒有可導出的數據！');
        return;
    }

    // 創建一個工作表
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        const rowData = [];
        for (const cell of cells) {
            rowData.push(cell.textContent);
        }
        csv.push(rowData.join(','));
    }

    // 下載 CSV 文件
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '搜尋結果.csv';
    link.click();
} 