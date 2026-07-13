Pod::Spec.new do |s|
  s.name           = 'AuraBoardHealthConnect'
  s.version        = '0.0.1'
  s.summary        = 'Aura Board HealthKit walking data module'
  s.description    = 'Reads step count and walking distance from Apple Health.'
  s.homepage        = 'https://aura-board.com'
  s.license         = { :type => 'MIT' }
  s.authors         = { 'Aura Board' => 'support@aura-board.com' }
  s.platforms       = { :ios => '15.1' }
  s.swift_version   = '5.9'
  # Expo autolinking uses this local pod directly; no remote tag is required.
  s.source          = { :git => '' }
  s.static_framework = true
  s.source_files    = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
end
