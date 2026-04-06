$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = 'D:\gongsihegui\downloads\california'
$oshaDir = Join-Path $root 'osha'
$cslbDir = Join-Path $root 'cslb'
$sosDir = Join-Path $root 'sos'
$snapshotDir = Join-Path $root 'snapshots'

foreach ($dir in @($root, $oshaDir, $cslbDir, $sosDir, $snapshotDir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

function Save-Url {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [long]$MinLength = 1
    )

    if (Test-Path $OutFile) {
        $existing = Get-Item $OutFile
        if ($existing.Length -ge $MinLength) {
            Write-Host "Skip existing: $OutFile"
            return
        }

        Write-Host "Replacing invalid placeholder: $OutFile"
        Remove-Item $OutFile -Force
    }

    Write-Host "Downloading: $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

$oshaFiles = @(
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA_300A_Summary_Data_2024_through_12-31-2025.zip'; Name = 'ITA_300A_Summary_Data_2024_through_12-31-2025.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/summary_data_dictionary.pdf'; Name = 'summary_data_dictionary.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA_Case_Detail_Data_2024_through_12-31-2025.zip'; Name = 'ITA_Case_Detail_Data_2024_through_12-31-2025.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/case_detail_data_dictionary.pdf'; Name = 'case_detail_data_dictionary.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA_300A_Summary_Data_2023_through_12-31-2024.zip'; Name = 'ITA_300A_Summary_Data_2023_through_12-31-2024.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/largefiles/ITA_Case_Detail_Data_2023_through_12-31-2023OIICS.zip'; Name = 'ITA_Case_Detail_Data_2023_through_12-31-2023OIICS.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA-data-cy2022.zip'; Name = 'ITA-data-cy2022.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA-data-cy2021.zip'; Name = 'ITA-data-cy2021.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA-Data-CY-2020.zip'; Name = 'ITA-Data-CY-2020.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA%20Data%20CY%202019.zip'; Name = 'ITA-Data-CY-2019.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA%20Data%20CY%202018.zip'; Name = 'ITA-Data-CY-2018.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA%20Data%20CY%202017.zip'; Name = 'ITA-Data-CY-2017.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA%20Data%20CY%202016.zip'; Name = 'ITA-Data-CY-2016.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA_Data_Dictionary.pdf'; Name = 'ITA_Data_Dictionary.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ITA_data_users_guide.pdf'; Name = 'ITA_data_users_guide.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/OSHA_2024_Work-Related_Injury_and_Illness_Summary.pdf'; Name = 'OSHA_2024_Work-Related_Injury_and_Illness_Summary.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/OSHA_2023_Work-Related_Injury_and_Illness_Summary.pdf'; Name = 'OSHA_2023_Work-Related_Injury_and_Illness_Summary.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/ComparisonBetweenOSHAITA_Data_and_BLS_SOII_Estimates.pdf'; Name = 'ComparisonBetweenOSHAITA_Data_and_BLS_SOII_Estimates.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/January2015toJuly2025.zip'; Name = 'January2015toJuly2025.zip' },
    @{ Url = 'https://www.osha.gov/sites/default/files/2024_Annual_Report_of_Fed_OSHA_SIRs.pdf'; Name = '2024_Annual_Report_of_Fed_OSHA_SIRs.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/OSHA_SIR_Annual_Report-2022-2023_final.pdf'; Name = 'OSHA_SIR_Annual_Report-2022-2023_final.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/severe-injury-2015.pdf'; Name = 'severe-injury-2015.pdf' },
    @{ Url = 'https://www.osha.gov/sites/default/files/severe-injury-report-2015to2021.pdf'; Name = 'severe-injury-report-2015to2021.pdf' }
)

foreach ($file in $oshaFiles) {
    Save-Url -Url $file.Url -OutFile (Join-Path $oshaDir $file.Name)
}

$cslbFiles = @(
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=MasterLicenseData&type=C'; Name = 'master_license.csv' },
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=MasterLicenseData&type=E'; Name = 'master_license.xls' },
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=WorkerCompData&type=C'; Name = 'workers_comp.csv' },
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=WorkerCompData&type=E'; Name = 'workers_comp.xls' },
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=PersonnelData&type=C'; Name = 'personnel.csv' },
    @{ Url = 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=PersonnelData&type=E'; Name = 'personnel.xls' }
)

foreach ($file in $cslbFiles) {
    Save-Url -Url $file.Url -OutFile (Join-Path $cslbDir $file.Name) -MinLength 2048
}

$snapshotFiles = @(
    @{ Url = 'https://www.cslb.ca.gov/Consumers/Data.aspx'; Name = 'cslb_consumers_data.html' },
    @{ Url = 'https://www.cslb.ca.gov/onlineservices/dataportal/'; Name = 'cslb_data_portal.html' },
    @{ Url = 'https://www.cslb.ca.gov/onlineservices/dataportal/ContractorList'; Name = 'cslb_contractor_list.html' },
    @{ Url = 'https://www.osha.gov/Establishment-Specific-Injury-and-Illness-Data'; Name = 'osha_ita.html' },
    @{ Url = 'https://www.osha.gov/severe-injury-reports'; Name = 'osha_severe_injury_dashboard.html' },
    @{ Url = 'https://bizfileonline.sos.ca.gov/search/business'; Name = 'sos_business_search.html' }
)

foreach ($file in $snapshotFiles) {
    try {
        Save-Url -Url $file.Url -OutFile (Join-Path $snapshotDir $file.Name)
    }
    catch {
        Write-Warning "Snapshot failed: $($file.Url) - $($_.Exception.Message)"
    }
}

try {
    $postingPageUrl = 'https://www.cslb.ca.gov/Consumers/Data.aspx'
    $postingPage = Invoke-WebRequest -Uri $postingPageUrl -UseBasicParsing
    $postingMatches = [regex]::Matches($postingPage.Content, 'href=(/Resources/CSLB/(PL\d{6}\.pdf|PP\d{6}\.pdf))') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique

    foreach ($relativePath in $postingMatches) {
        $fileUrl = [System.Uri]::new([System.Uri]'https://www.cslb.ca.gov', $relativePath).AbsoluteUri
        $fileName = Split-Path $relativePath -Leaf
        Save-Url -Url $fileUrl -OutFile (Join-Path $cslbDir $fileName) -MinLength 1024
    }
}
catch {
    Write-Warning "Posting list download failed: $($_.Exception.Message)"
}

$manifest = [ordered]@{
    generated_at = (Get-Date).ToString('s')
    root = $root
    osha_files = (Get-ChildItem $oshaDir | Sort-Object Name | Select-Object Name, Length)
    cslb_files = (Get-ChildItem $cslbDir | Sort-Object Name | Select-Object Name, Length)
    snapshots = (Get-ChildItem $snapshotDir | Sort-Object Name | Select-Object Name, Length)
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $root 'manifest.json') -Encoding UTF8
Write-Host 'Done. Manifest written to downloads\california\manifest.json'
